import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { CreatePlanFromStripeDto } from './dto/create-plan-from-stripe.dto';
import { WebsocketService } from 'src/websocket/websocket.service';
import { CreditService } from 'src/credits/credit.service';
import { UpdatePlanFromFormDto } from './dto/update-plan-from-form.dto';
import { UpdateSubscriptionOverridesDto } from './dto/update-subscription-overrides.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkspacesService } from 'src/workspaces/workspaces.service';
import { EmailService } from 'src/email/email.service';

const PRICE_PER_CREDIT_CENTS = 4;

interface ExtendedInvoice extends Stripe.Invoice {
  subscription?: string;
  payment_intent?: {
    last_payment_error?: {
      message?: string
    }
  }
}

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,

    @Inject(forwardRef(() => CreditService))
    private creditService: CreditService,

    @Inject(forwardRef(() => WorkspacesService))    
    private workspaceService: WorkspacesService,
    private websocketService: WebsocketService,
    private emailService: EmailService
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-05-28.basil',
      }
    );
  }


  @Cron(CronExpression.EVERY_10_MINUTES)
  async deactivateUnpaidWorkspacesTask() {
    this.logger.log('Running scheduled task to check for unpaid workspaces...');
  
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
    const subscriptionsToDeactivate = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        lastPaymentFailedAt: {
          lte: oneHourAgo,
        },
      },
      select: {
        workspaceId: true,
      },
    });
  
    for (const sub of subscriptionsToDeactivate) {
      try {
        await this.workspaceService.deactivateWorkspace(sub.workspaceId);
      } catch (error) {
        this.logger.error(
          `Failed to deactivate workspace ${sub.workspaceId}: ${error.message}`
        );
      }
    }
  
    this.logger.log(
      `Finished checking unpaid workspaces: ${subscriptionsToDeactivate.length} deactivated`
    );
  }

  async getStripeProducts(): Promise<
    {
      product: Stripe.Product;
      prices: Stripe.Price[];
      metadata: {
        features?: any;
        creditsLimit?: number | null;
        agentLimit?: number | null;
        isEnterprise?: boolean;
        trialDays?: number | null;
      } | null;
    }[]
  > {
    const allProducts = await this.stripe.products.list({
      limit: 100,
    });

    // Filter out CLI-created or invalid test products
    const customProducts = allProducts.data.filter(
      (product) => product.description !== '(created by Stripe CLI)'
    );

    const enrichedProducts = await Promise.all(
      customProducts.map(async (product) => {
        const prices = await this.stripe.prices.list({
          product: product.id
        });

        // Try to find a corresponding plan in your database using price ID
        const matchedPlan = await this.prisma.plan.findFirst({
          where: { stripeProductId: product.id }
        });

        return {
          product,
          prices: prices.data,
          metadata: matchedPlan || null,
        };
      })
    );

    return enrichedProducts;
  }

  async createPlanFromForm({
    name,
    description,
    price, // in cents
    features,
    creditsLimit,
    agentsLimit,
    trialDays,
    trainingTextLimit,
    trainingDocumentLimit,
    trainingVideoLimit,
    trainingWebsiteLimit,
    isEnterprise,
  }: UpdatePlanFromFormDto): Promise<{ message: string; plan: any }> {
    // 1. Verifica se já existe um plano local com o mesmo nome
    const existingLocalPlan = await this.prisma.plan.findFirst({
      where: { name },
    });

    if (existingLocalPlan) {
      throw new Error(`Já existe um plano local com o nome "${name}".`);
    }

    // 2. Verifica se já existe um produto no Stripe com o mesmo nome
    const stripeProducts = await this.stripe.products.list({ limit: 100 });
    const existingStripeProduct = stripeProducts.data.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );

    if (existingStripeProduct) {
      throw new Error(`Já existe um produto no Stripe com o nome "${name}".`);
    }

    // 3. Cria novo produto no Stripe
    const product = await this.stripe.products.create({
      name,
      description,
      metadata: {
        createdFrom: 'app',
      },
    });

    // 4. Cria novo preço no Stripe
    const newPrice = await this.stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: price,
      recurring: {
        interval: 'month',
      },
    });

    // 5. Cria o plano no banco com isActive = false
    const createdPlan = await this.prisma.plan.create({
      data: {
        name,
        description,
        stripeProductId: product.id,
        stripePriceId: newPrice.id,
        features,
        creditsLimit,
        agentLimit: agentsLimit,
        trialDays,
        trainingTextLimit,
        trainingDocumentLimit,
        trainingVideoLimit,
        trainingWebsiteLimit,
        isEnterprise,
        isActive: false, // força desativado
      },
    });

    return {
      message: 'Plano criado com sucesso no Stripe e localmente',
      plan: createdPlan,
    };
  }

  async updatePlanFromForm({
    name,
    description,
    price, // in cents
    features,
    creditsLimit,
    agentsLimit,
    trialDays,
    trainingTextLimit,
    trainingDocumentLimit,
    trainingVideoLimit,
    trainingWebsiteLimit,
    isEnterprise,
    isActive
  }: UpdatePlanFromFormDto): Promise<{ message: string; plan: any }> {
    // 1. Look up product by name
    const products = await this.stripe.products.list({ limit: 100 });
    const product = products.data.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );

    if (!product) {
      throw new Error(`No product found with name "${name}"`);
    }

    // 2. Update product description
    await this.stripe.products.update(product.id, {
      description: description,
    });

    // 3. Find current price and create a new one if necessary
    const prices = await this.stripe.prices.list({ product: product.id });
    const currentPrice = prices.data[0];

    let priceId = currentPrice?.id;

    // Only create new price if value changed or none exists
    if (!currentPrice || currentPrice.unit_amount !== price) {
      const newPrice = await this.stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: price,
        recurring: {
          interval: 'month',
        },
      });
      priceId = newPrice.id;
    }

    // 4. Update local plan entry
    const plan = await this.prisma.plan.findFirst({
      where: { name: name },
    });

    if (!plan) {
      throw new Error(`No local plan found with name "${name}"`);
    }

    const updated = await this.prisma.plan.update({
      where: { id: plan.id },
      data: {
        description,
        stripePriceId: priceId,
        stripeProductId: product.id,
        features,
        creditsLimit,
        agentLimit: agentsLimit,
        trainingTextLimit,
        trainingDocumentLimit,
        trainingVideoLimit,
        trainingWebsiteLimit,
        isEnterprise,
        isActive,
        trialDays,
      },
    });

    return {
      message: 'Stripe and local plan updated successfully',
      plan: updated,
    };
  }

  async updateSubscriptionOverrides(
    dto: UpdateSubscriptionOverridesDto
  ): Promise<{ message: string; subscriptionId: string }> {
    const { subscriptionId, overrides } = dto;

    const existingSub = await this.prisma.subscription.findUnique({
      where: {
        id: subscriptionId,
        status: {
          in: ['ACTIVE', 'TRIAL'],
        },
      },
    });

    if (!existingSub) {
      throw new Error(`No active or trial subscription found with ID ${subscriptionId}`);
    }

    const updatePayload: Record<string, any> = {};

    if ('featureOverrides' in overrides)
      updatePayload.featureOverrides = overrides.featureOverrides;

    if ('customStripePriceId' in overrides)
      updatePayload.customStripePriceId = overrides.customStripePriceId;

    const overrideFields: (keyof typeof overrides)[] = [
      'creditsLimitOverrides',
      'agentLimitOverrides',
      'trainingTextLimitOverrides',
      'trainingWebsiteLimitOverrides',
      'trainingVideoLimitOverrides',
      'trainingDocumentLimitOverrides',
    ];

    for (const field of overrideFields) {
      const value = overrides[field];
      if (
        value === null ||
        (typeof value === 'object' &&
          value !== null &&
          'explicitlySet' in value &&
          typeof value.explicitlySet === 'boolean')
      ) {
        updatePayload[field] = value;
      } else if (value !== undefined) {
        throw new Error(`Invalid override structure for ${field}`);
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: updatePayload,
      select: { id: true },
    });

    return {
      message: 'Subscription overrides updated successfully',
      subscriptionId: updated.id,
    };
  }

  async syncPlanFromStripe(dto: CreatePlanFromStripeDto) {
    const matchingProducts = await this.stripe.products.list({
      limit: 100,
    });

    const product = matchingProducts.data.find(
      (p) => p.name.toLowerCase() === dto.planName.toLowerCase()
    );

    if (!product) {
      throw new Error(
        `No active Stripe product found with name "${dto.planName}"`
      );
    }

    const prices = await this.stripe.prices.list({
      product: product.id,
      limit: 10,
    });

    const selectedPrice = prices.data[0];
    if (!selectedPrice) {
      throw new Error(
        `No active Stripe price found for product "${product.name}"`
      );
    }

    const existingPlan = await this.prisma.plan.findFirst({
      where: {
        stripePriceId: selectedPrice.id,
      },
    });

    if (existingPlan) {
      const updated = await this.prisma.plan.update({
        where: { id: existingPlan.id },
        data: {
          name: product.name,
          description: product.description || null,
          features: dto.features || [],
          creditsLimit: dto.creditsLimit ?? existingPlan.creditsLimit,
          agentLimit: dto.agentLimit ?? null,
          trainingDocumentLimit: dto.trainingDocumentLimit ?? null,
          trainingWebsiteLimit: dto.trainingWebsiteLimit ?? null,
          trainingVideoLimit: dto.trainingVideoLimit ?? null,
          trainingTextLimit: dto.trainingTextLimit ?? null,
          isEnterprise: dto.isEnterprise ?? existingPlan.isEnterprise,
          trialDays: dto.trialDays ?? null,
          isActive: true,
        },
      });

      return {
        message: 'Plan already existed and was updated successfully',
        plan: updated,
      };
    }

    const newPlan = await this.prisma.plan.create({
      data: {
        name: product.name,
        description: product.description || null,
        stripeProductId: product.id,
        stripePriceId: selectedPrice.id,
        features: dto.features || [],
        creditsLimit: dto.creditsLimit || null,
        agentLimit: dto.agentLimit || null,
        isEnterprise: dto.isEnterprise || false,
        trialDays: dto.trialDays || null,
        isActive: true,
      },
    });

    return {
      message: 'Plan created successfully',
      plan: newPlan,
    };
  }

  async getPriceDetailsById(stripePriceId: string): Promise<{
    id: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
  } | null> {
    try {
      const price = await this.stripe.prices.retrieve(stripePriceId);
      return {
        id: price.id,
        amount: price.unit_amount ?? 0,
        currency: price.currency,
        interval: price.recurring?.interval ?? 'one_time',
        intervalCount: price.recurring?.interval_count ?? 1,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve Stripe price (${stripePriceId}): ${error.message}`
      );
      return null;
    }
  }

  async getSubscriptionsForWorkspace(
    workspaceId: string
  ): Promise<Stripe.Subscription[]> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace?.stripeCustomerId) return [];

    const subscriptions = await this.stripe.subscriptions.list({
      customer: workspace.stripeCustomerId,
      status: 'all',
      limit: 5,
    });

    return subscriptions.data;
  }

  async createCheckoutSession(
    workspaceId: string,
    priceId: string
  ): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.configService.get('FRONTEND_URL')}/billing-success`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/cancel`,
      metadata: { workspaceId },

      // 🔐 Garante que o método de pagamento será coletado e salvo
      payment_method_collection: 'always',

      // 🛠 Força a criação de SetupIntent, mesmo em modo subscription
      setup_intent_data: {},
    });

    return session.url!;
  }

  async getBillingStatus(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            currentPeriodEnd: true,
            trialEnd: true,
            featureOverrides: true,
            creditsLimitOverrides: true,
            agentLimitOverrides: true,
            trainingTextLimitOverrides: true,
            trainingWebsiteLimitOverrides: true,
            trainingVideoLimitOverrides: true,
            trainingDocumentLimitOverrides: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
            plan: {
              select: {
                name: true,
                stripePriceId: true,
                description: true,
                features: true,
                creditsLimit: true,
                agentLimit: true,
                trainingTextLimit: true,
                trainingWebsiteLimit: true,
                trainingVideoLimit: true,
                trainingDocumentLimit: true,
                isEnterprise: true,
                trialDays: true,
              },
            },
          },
        },
        usageRecords: true,
      },
    });

    const smartRecharge = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId },
    });    

    const { planCreditsRemaining, extraCreditsRemaining } =
      await this.creditService.getWorkspaceRemainingCredits(workspaceId);

    const latestSub = workspace?.subscriptions?.[0];

    const { plan, ...remainingData } = latestSub;

    const stripePrice = plan?.stripePriceId
      ? await this.getPriceDetailsById(plan.stripePriceId)
      : undefined;

    return {
      subscription: remainingData,
      plan:
        plan && stripePrice
          ? {
              ...plan,
              ...stripePrice,
            }
          : undefined,
      smartRecharge: smartRecharge || undefined,
      planCreditsRemaining,
      extraCreditsRemaining
    };
  }

  async createCustomerPortal(workspaceId: string): Promise<string> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace?.stripeCustomerId) {
      throw new Error('Workspace does not have an associated Stripe customer');
    }

    const portalSession = await this.stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${this.configService.get('FRONTEND_URL')}/billing`,
    });

    return portalSession.url;
  }

  async createOneTimeCreditPurchaseSession(
    workspaceId: string,
    amount: number // number of credits to purchase
  ): Promise<string> {
    if (amount <= 0) {
      throw new Error('Invalid credit amount');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (
      !workspace ||
      !workspace.stripeCustomerId ||
      workspace.stripeCustomerId === 'trial-local'
    ) {
      throw new Error(
        'Cannot purchase credits: workspace does not have a valid Stripe customer'
      );
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: 'ACTIVE',
      },
    });

    if (!subscription || subscription.stripeSubscriptionId === 'trial-local') {
      throw new Error('Cannot purchase credits during trial period');
    }

    // Set your price per credit here (e.g. $0.01 per credit)
    const totalCents = amount * PRICE_PER_CREDIT_CENTS;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: workspace.stripeCustomerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: totalCents,
            product_data: {
              name: `${amount} Extra Credits`,
              description: 'One-time credit purchase',
              metadata: {
                type: 'credit',
                credits: amount.toString()
              }
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get('FRONTEND_URL')}/billing-success?type=credit-purchase`,
      cancel_url: `${this.configService.get('FRONTEND_URL')}/cancel`,
      metadata: {
        workspaceId,
        credits: amount.toString(),
        type: 'credit_purchase'
      },
      // Add payment intent data to make identification easier
      payment_intent_data: {
        metadata: {
          workspaceId,
          credits: amount.toString(),
          type: 'credit_purchase',
        },
      },
    });

    return session.url!;
  }

  async createAndPayInvoiceWithItem(params: {
    customer: string;
    amount: number;
    currency: string;
    description: string;
  }): Promise<Stripe.Invoice> {
    const totalCents = params.amount * PRICE_PER_CREDIT_CENTS;

    try {
      // 1. Cria o item da fatura
      await this.stripe.invoiceItems.create({
        customer: params.customer,
        amount: totalCents,
        currency: params.currency,
        description:
          params.description || `Smart Recharge - ${params.amount} créditos`,
      });

      // 2. Verifica se o cliente tem payment method padrão
      const customer = (await this.stripe.customers.retrieve(
        params.customer
      )) as Stripe.Customer;
      let defaultPm = customer.invoice_settings?.default_payment_method;

      if (
        !defaultPm ||
        (typeof defaultPm === 'string' && defaultPm.trim() === '')
      ) {
        this.logger.warn(
          `Customer ${params.customer} has no default payment method. Attempting to set one manually.`
        );

        const paymentMethods = await this.stripe.paymentMethods.list({
          customer: params.customer,
          type: 'card',
        });

        const firstValidPm = paymentMethods.data[0];

        if (!firstValidPm) {
          throw new Error(
            `Cannot pay invoice: no valid card payment methods found for customer ${params.customer}.`
          );
        }

        await this.stripe.customers.update(params.customer, {
          invoice_settings: { default_payment_method: firstValidPm.id },
        });

        defaultPm = firstValidPm.id;
        this.logger.log(
          `Set default payment method ${firstValidPm.id} for customer ${params.customer}.`
        );
      }

      // 3. Cria a fatura (auto_advance manual)
      const invoice = await this.stripe.invoices.create({
        customer: params.customer,
        auto_advance: false,
        collection_method: 'charge_automatically',
        pending_invoice_items_behavior: 'include',
      });

      this.logger.log(
        `Invoice ${invoice.id} created for customer ${params.customer} with ${totalCents} cents.`
      );

      // 4. Finaliza a fatura
      const finalized = await this.stripe.invoices.finalizeInvoice(invoice.id);
      this.logger.log(`Invoice ${finalized.id} finalized.`);

      // 5. Tenta pagamento imediato
      const paid = await this.stripe.invoices.pay(finalized.id);
      this.logger.log(`Invoice ${paid.id} paid.`);

      return paid;
    } catch (error: any) {
      this.logger.error(`Error creating or paying invoice: ${error.message}`);
      throw error;
    }
  }

  async previewPlanChange(workspaceId: string, newPriceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.stripeCustomerId) {
      throw new Error('Workspace does not have a Stripe customer');
    }

    const subscriptionList = await this.stripe.subscriptions.list({
      customer: workspace.stripeCustomerId,
      status: 'all',
      limit: 1,
    });

    const currentSubscription = subscriptionList.data[0];
    const currentItem = currentSubscription?.items?.data[0];

    if (!currentSubscription || !currentItem) {
      throw new Error('Current active subscription not found');
    }

    const prorationDate = Math.floor(Date.now() / 1000);

    const invoicePreview = await this.stripe.invoices.createPreview({
      customer: workspace.stripeCustomerId,
      subscription: currentSubscription.id,
      subscription_details: {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_date: prorationDate,
      },
    });

    const currentPrice = currentItem.price;
    const newPrice = await this.stripe.prices.retrieve(newPriceId);

    const nextBillingTimestamp = invoicePreview.lines?.data?.find(
      (item) => item.period?.end
    )?.period?.end;

    const summary = {
      currentPlan: {
        name: currentPrice.nickname || currentPrice.id,
        price: currentPrice.unit_amount ?? 0,
      },
      newPlan: {
        name: newPrice.nickname || newPrice.id,
        price: newPrice.unit_amount ?? 0,
      },
      addons: [], // customize here if needed
      nextBillingDate: nextBillingTimestamp
        ? new Date(nextBillingTimestamp * 1000)
        : null,
      difference: (newPrice.unit_amount ?? 0) - (currentPrice.unit_amount ?? 0),
      type:
        (newPrice.unit_amount ?? 0) > (currentPrice.unit_amount ?? 0)
          ? 'UPGRADE'
          : 'DOWNGRADE',
      creditNote:
        (newPrice.unit_amount ?? 0) < (currentPrice.unit_amount ?? 0)
          ? 'O valor excedente será abatido em suas próximas faturas.'
          : undefined,
    };

    return summary;
  }

  async confirmPlanChange(workspaceId: string, newPriceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.stripeCustomerId) {
      throw new Error('Workspace does not have a Stripe customer');
    }

    const subscriptionList = await this.stripe.subscriptions.list({
      customer: workspace.stripeCustomerId,
      status: 'all',
      limit: 1,
    });

    const subscription = subscriptionList.data[0];

    if (!subscription || subscription.items.data.length === 0) {
      throw new Error('Active subscription not found for workspace');
    }

    const updated = await this.stripe.subscriptions.update(subscription.id, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    return {
      message: 'Subscription updated successfully',
      subscriptionId: updated.id,
    };
  }

  async getWorkspacePaymentsInPeriod(workspaceId: string, startDate: Date, endDate: Date) {
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    // Get product IDs from your database
    const subscriptionProductIds = await this.getSubscriptionProductIds();
    const creditProductIds = await this.getCreditProductIds();

    // Use Payment Intents for accurate data (recommended for newer API versions)
    const paymentIntentsParams: Stripe.PaymentIntentListParams = {
      limit: 100,
      created: { gte: startTs, lte: endTs },
      expand: ['data.invoice', 'data.customer']
    };

    // Get all successful payment intents
    const paymentIntents = await this.getAllPaymentIntents(paymentIntentsParams);

    // Process transactions
    const allTransactions = await this.processTransactions(
      paymentIntents,
      subscriptionProductIds,
      creditProductIds
    );

    // Initialize a map for daily aggregates
    const summaryByDate: Record<string, {
      date: string;
      planAmount: number;
      oneTimeAmount: number;
      total: number;
      clients: Record<string, number>;
    }> = {};

    for (const transaction of allTransactions) {
      const dateStr = new Date(transaction.created * 1000).toISOString().slice(0, 10);
      
      if (!summaryByDate[dateStr]) {
        summaryByDate[dateStr] = { 
          date: dateStr, 
          planAmount: 0, 
          oneTimeAmount: 0, 
          total: 0, 
          clients: {} 
        };
      }
      
      const dayEntry = summaryByDate[dateStr];
      const amountUsd = transaction.amount / 100;

      if (transaction.isSubscription) {
        dayEntry.planAmount += amountUsd;
      } else {
        dayEntry.oneTimeAmount += amountUsd;
      }
      dayEntry.total += amountUsd;

      // Aggregate amount per client email for that day
      dayEntry.clients[transaction.customerEmail] = 
        (dayEntry.clients[transaction.customerEmail] || 0) + amountUsd;
    }

    return Object.values(summaryByDate).sort((a, b) => a.date.localeCompare(b.date));
  }

  private async getAllPaymentIntents(params: Stripe.PaymentIntentListParams): Promise<Stripe.PaymentIntent[]> {
    const paymentIntents: Stripe.PaymentIntent[] = [];
    let hasMore = true;
    
    while (hasMore) {
      const page = await this.stripe.paymentIntents.list(params);
      
      // Only include succeeded payment intents in USD
      const validPaymentIntents = page.data.filter(pi => 
        pi.status === 'succeeded' && pi.currency === 'usd'
      );
      
      paymentIntents.push(...validPaymentIntents);
      
      hasMore = page.has_more;
      if (hasMore) {
        params.starting_after = page.data[page.data.length - 1].id;
      }
    }
    
    return paymentIntents;
  }

  private async processTransactions(
    paymentIntents: Stripe.PaymentIntent[],
    subscriptionProductIds: string[],
    creditProductIds: string[]
  ): Promise<Array<{
    id: string;
    amount: number;
    created: number;
    customerEmail: string;
    isSubscription: boolean;
    type: 'payment_intent';
  }>> {
    const transactions = [];

    for (const pi of paymentIntents) {
      const customerEmail = await this.getCustomerEmail(pi.customer, pi.receipt_email);
      const isSubscription = await this.determineIfSubscription(pi, subscriptionProductIds, creditProductIds);
      
      transactions.push({
        id: pi.id,
        amount: pi.amount,
        created: pi.created,
        customerEmail,
        isSubscription,
        type: 'payment_intent' as const
      });
    }

    return transactions;
  }

  private async getCustomerEmail(customer: any, receiptEmail?: string | null): Promise<string> {
    if (receiptEmail) return receiptEmail;
    
    if (customer) {
      if (typeof customer === 'string') {
        try {
          const customerObj = await this.stripe.customers.retrieve(customer);
          return (customerObj as Stripe.Customer).email || 'unknown';
        } catch (error) {
          console.warn('Failed to fetch customer:', error);
        }
      } else if (customer.email) {
        return customer.email;
      }
    }
    
    return 'unknown';
  }

  private async determineIfSubscription(
    paymentIntent: Stripe.PaymentIntent,
    subscriptionProductIds: string[],
    creditProductIds: string[]
  ): Promise<boolean> {
    // Check metadata first
    const metadata = paymentIntent.metadata || {};
    if (metadata.subscription_id || metadata.type === 'subscription') {
      return true;
    }
    if (metadata.type === 'credits' || metadata.type === 'one_time') {
      return false;
    }

    // Check if this is a credit purchase based on checkout session metadata
    const isCreditPurchase = await this.checkIfCreditPurchase(paymentIntent);
    if (isCreditPurchase) {
      return false;
    }

    // Check invoice if available
    const invoice = (paymentIntent as any).invoice;
    if (invoice) {
      const isSubscriptionFromInvoice = await this.checkInvoiceForSubscription(
        invoice, 
        subscriptionProductIds, 
        creditProductIds
      );
      if (isSubscriptionFromInvoice !== null) {
        return isSubscriptionFromInvoice;
      }
    }

    // Check if description contains subscription indicators
    const description = paymentIntent.description?.toLowerCase() || '';
    if (description.includes('subscription')) return true;
    if (description.includes('credit') || description.includes('one-time')) return false;

    // If we can't determine, check if it has a subscription context
    // This is a fallback - you might want to adjust based on your business logic
    return false;
  }

  private async checkInvoiceForSubscription(
    invoice: any,
    subscriptionProductIds: string[],
    creditProductIds: string[]
  ): Promise<boolean | null> {
    try {
      let fullInvoice: ExtendedInvoice;
      
      if (typeof invoice === 'string') {
        // Fetch invoice with proper expansion limits
        fullInvoice = await this.stripe.invoices.retrieve(invoice, {
          expand: ['lines.data.price']
        });
      } else {
        fullInvoice = invoice;
      }

      // If invoice has a subscription, it's definitely a subscription payment
      if (fullInvoice.subscription) {
        return true;
      }

      // Analyze line items to determine type
      if (fullInvoice.lines?.data) {
        const lineItemAnalysis = await this.analyzeInvoiceLineItems(
          fullInvoice, 
          subscriptionProductIds, 
          creditProductIds
        );
        if (lineItemAnalysis !== null) {
          return lineItemAnalysis;
        }
      }

      return null; // Unable to determine from invoice
    } catch (error) {
      console.warn('Failed to analyze invoice:', error);
      return null;
    }
  }

  private async analyzeInvoiceLineItems(
    invoice: Stripe.Invoice,
    subscriptionProductIds: string[],
    creditProductIds: string[]
  ): Promise<boolean | null> {
    if (!invoice.lines?.data) return null;

    let hasSubscriptionProduct = false;
    let hasCreditProduct = false;

    for (const lineItem of invoice.lines.data) {
      const price = (lineItem as any).price;
      
      if (price?.product) {
        let productId: string;
        
        // If product is already expanded
        if (typeof price.product === 'object') {
          productId = price.product.id;
        } else {
          // Product is just an ID, need to fetch it if needed
          productId = price.product;
          
          // For efficiency, we can also check the price metadata or description
          // to avoid additional API calls
          if (price.nickname?.toLowerCase().includes('credit') || 
              price.metadata?.type === 'credit') {
            hasCreditProduct = true;
            continue;
          }
        }

        if (subscriptionProductIds.includes(productId)) {
          hasSubscriptionProduct = true;
        }
        if (creditProductIds.includes(productId)) {
          hasCreditProduct = true;
        }
      }
      
      // Also check line item description for credit indicators
      const description = (lineItem.description || '').toLowerCase();
      if (description.includes('credit') || description.includes('extra credits')) {
        hasCreditProduct = true;
      }
    }

    // If we found subscription products, it's a subscription
    if (hasSubscriptionProduct) return true;
    
    // If we found credit products, it's one-time
    if (hasCreditProduct) return false;

    // If we couldn't identify any products, return null for further analysis
    return null;
  }

  // Fixed database methods
  private async getSubscriptionProductIds(): Promise<string[]> {
    const plans = await this.prisma.plan.findMany({
      select: { stripeProductId: true }
    });
    
    return plans
      .map(plan => plan.stripeProductId)
      .filter(id => id !== null); // Filter out null values
  }

  private async getCreditProductIds(): Promise<string[]> {
    // Since ExtraCreditPurchase doesn't have stripeProductId, 
    // you need to define your credit products elsewhere
    // Option 1: Create a separate table for credit products
    // Option 2: Use a configuration object
    // Option 3: Query your price/product configuration
    
    // For now, I'll show you how to get them from Stripe directly
    // You should replace this with your actual credit product IDs
    return await this.getCreditProductIdsFromConfig();
  }

  private async checkIfCreditPurchase(paymentIntent: Stripe.PaymentIntent): Promise<boolean> {
    try {
      // If the payment intent has a checkout session, get it to check metadata
      if (paymentIntent.metadata?.checkout_session_id) {
        const session = await this.stripe.checkout.sessions.retrieve(
          paymentIntent.metadata.checkout_session_id
        );
        
        // Check if session metadata indicates credit purchase
        if (session.metadata?.credits || session.metadata?.workspaceId) {
          return true;
        }
      }

      // Alternative: Check if this payment matches our credit purchase pattern
      // Look for checkout sessions created around the same time with credit metadata
      const sessions = await this.stripe.checkout.sessions.list({
        limit: 10,
        created: {
          gte: paymentIntent.created - 300, // 5 minutes before
          lte: paymentIntent.created + 300, // 5 minutes after
        },
      });

      for (const session of sessions.data) {
        if (
          session.payment_intent === paymentIntent.id &&
          (session.metadata?.credits || session.metadata?.workspaceId)
        ) {
          return true;
        }
      }

      // Check if the line items contain credit-related product names
      const charges = await this.stripe.charges.list({
        payment_intent: paymentIntent.id,
        limit: 1,
      });

      if (charges.data.length > 0) {
        const charge = charges.data[0];
        const description = charge.description?.toLowerCase() || '';
        
        // Check for credit-specific patterns in description
        if (
          description.includes('extra credits') ||
          description.includes('credit purchase') ||
          description.includes('credits')
        ) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.warn('Failed to check if credit purchase:', error);
      return false;
    }
  }

  private async getCreditProductIdsFromConfig(): Promise<string[]> {
    // Since you're using dynamic pricing, we don't need to fetch specific product IDs
    // Instead, we'll identify credit purchases through checkout session metadata
    // and product descriptions. Return empty array since we're not using predefined products.
    return [];
  }


  constructWebhookEvent(
    rawBody: Buffer,
    signature: string | string[]
  ): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET'
    );
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature as string,
      webhookSecret
    );
  }

  async handleWebhook(event: Stripe.Event): Promise<void> {
    const data = event.data.object;
    this.logger.debug(
      'Received Stripe webhook:',
      JSON.stringify(event, null, 4)
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = data as Stripe.Checkout.Session;
        const workspaceId = session.metadata?.workspaceId;
        if (!workspaceId) {
          this.logger.warn('Missing workspaceId in metadata');
          return;
        }

        const fullSession = await this.stripe.checkout.sessions.retrieve(
          session.id,
          {
            expand: [
              'customer',
              'subscription',
              'setup_intent',
              'payment_intent',
            ],
          }
        );

        const customer = fullSession.customer as Stripe.Customer;

        // Determina e aplica o payment_method ao Customer (somente se ainda não tiver)
        let paymentMethodId: string | undefined;

        if (typeof fullSession.setup_intent === 'string') {
          const setupIntent = await this.stripe.setupIntents.retrieve(
            fullSession.setup_intent
          );
          paymentMethodId = setupIntent.payment_method as string;
        } else if (typeof fullSession.payment_intent === 'string') {
          const paymentIntent = await this.stripe.paymentIntents.retrieve(
            fullSession.payment_intent
          );
          paymentMethodId = paymentIntent.payment_method as string;
        }

        if (paymentMethodId) {
          try {
            await this.stripe.paymentMethods.attach(paymentMethodId, {
              customer: customer.id,
            });
            this.logger.log(
              `Attached payment method ${paymentMethodId} to customer ${customer.id}`
            );
          } catch (e: any) {
            if (e.code !== 'resource_already_attached') {
              this.logger.error(
                `Failed to attach payment method ${paymentMethodId}: ${e.message}`
              );
              throw e;
            } else {
              this.logger.warn(
                `Payment method ${paymentMethodId} already attached`
              );
            }
          }

          await this.stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
          this.logger.log(
            `Set default_payment_method for customer ${customer.id}`
          );
        }

        if (session.mode === 'subscription') {
          const subscription = fullSession.subscription as Stripe.Subscription;
          const item = subscription.items.data[0];

          const plan = await this.prisma.plan.findFirst({
            where: { stripePriceId: item.price.id },
          });

          if (!plan) {
            this.logger.warn(`No plan found for price ID ${item.price.id}`);
            return;
          }

          await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { stripeCustomerId: customer.id },
          });

          const existing = await this.prisma.subscription.findFirst({
            where: { workspaceId },
          });

          const subscriptionData = {
            workspaceId,
            stripeCustomerId: customer.id,
            stripeSubscriptionId: subscription.id,
            planId: plan.id,
            status: subscription.status.toUpperCase() as any,
            currentPeriodStart: new Date(item.current_period_start * 1000),
            currentPeriodEnd: new Date(item.current_period_end * 1000),
            trialStart: subscription.trial_start
              ? new Date(subscription.trial_start * 1000)
              : null,
            trialEnd: subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at
              ? new Date(subscription.canceled_at * 1000)
              : null,
          };

          const subscriptionUpdated = existing
            ? await this.prisma.subscription.update({
                where: { id: existing.id },
                data: subscriptionData,
                select: {
                  status: true,
                  currentPeriodEnd: true,
                  trialEnd: true,
                  featureOverrides: true,
                  creditsLimitOverrides: true,
                  agentLimitOverrides: true,
                  trainingTextLimitOverrides: true,
                  trainingWebsiteLimitOverrides: true,
                  trainingVideoLimitOverrides: true,
                  trainingDocumentLimitOverrides: true,
                  cancelAtPeriodEnd: true,
                  canceledAt: true,
                  plan: {
                    select: {
                      name: true,
                      stripePriceId: true,
                      description: true,
                      features: true,
                      creditsLimit: true,
                      agentLimit: true,
                      trainingTextLimit: true,
                      trainingWebsiteLimit: true,
                      trainingVideoLimit: true,
                      trainingDocumentLimit: true,
                      isEnterprise: true,
                      trialDays: true,
                    },
                  },
                },
              })
            : await this.prisma.subscription.create({
                data: subscriptionData,
                select: {
                  status: true,
                  currentPeriodEnd: true,
                  trialEnd: true,
                  featureOverrides: true,
                  creditsLimitOverrides: true,
                  agentLimitOverrides: true,
                  trainingTextLimitOverrides: true,
                  trainingWebsiteLimitOverrides: true,
                  trainingVideoLimitOverrides: true,
                  trainingDocumentLimitOverrides: true,
                  cancelAtPeriodEnd: true,
                  canceledAt: true,
                  plan: {
                    select: {
                      name: true,
                      stripePriceId: true,
                      description: true,
                      features: true,
                      creditsLimit: true,
                      agentLimit: true,
                      trainingTextLimit: true,
                      trainingWebsiteLimit: true,
                      trainingVideoLimit: true,
                      trainingDocumentLimit: true,
                      isEnterprise: true,
                      trialDays: true,
                    },
                  },
                },
              });

          const { plan: planData, ...remainingData } = subscriptionUpdated;
          const stripePrice = planData?.stripePriceId
            ? await this.getPriceDetailsById(planData.stripePriceId)
            : undefined;

          this.websocketService.sendToClient(
            workspaceId,
            'subscriptionUpdated',
            {
              subscription: remainingData,
              plan:
                planData && stripePrice
                  ? { ...planData, ...stripePrice }
                  : undefined,
            }
          );
        } else if (session.mode === 'payment') {
          const quantity = parseInt(session.metadata?.credits || '0', 10);
          if (!quantity || quantity <= 0) {
            this.logger.warn('Invalid credit quantity in one-time purchase');
            return;
          }

          await this.prisma.extraCreditPurchase.create({
            data: {
              workspaceId,
              quantity,
              source: 'MANUAL',
              metadata: {
                stripeSessionId: session.id,
                paidAt: new Date().toISOString(),
              },
            },
          });

          this.logger.log(
            `Logged ${quantity} credits for workspace ${workspaceId}`
          );
        }

        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = data as Stripe.Subscription;
        const item = sub.items.data[0];

        const existingPlan = await this.prisma.plan.findFirst({
          where: { stripePriceId: item.price.id }
        });

        if (!existingPlan) {
          this.logger.warn(`No plan found for updated price ID ${item.price.id}`);
          return;
        }

        await this.prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status: sub.status.toUpperCase() as any,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            canceledAt: sub.canceled_at
              ? new Date(sub.canceled_at * 1000)
              : null,
            currentPeriodStart: new Date(item.current_period_start * 1000),
            currentPeriodEnd: new Date(item.current_period_end * 1000),
            trialStart: sub.trial_start
              ? new Date(sub.trial_start * 1000)
              : null,
            trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
            planId: existingPlan.id
          },
        });

        const existing = await this.prisma.subscription.findFirst({
          where: { stripeSubscriptionId: sub.id },
          select: {
            workspaceId: true,
            status: true,
            currentPeriodEnd: true,
            trialEnd: true,
            featureOverrides: true,
            creditsLimitOverrides: true,
            agentLimitOverrides: true,
            trainingTextLimitOverrides: true,
            trainingWebsiteLimitOverrides: true,
            trainingVideoLimitOverrides: true,
            trainingDocumentLimitOverrides: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
            plan: {
              select: {
                name: true,
                stripePriceId: true,
                description: true,
                features: true,
                creditsLimit: true,
                agentLimit: true,
                trainingTextLimit: true,
                trainingWebsiteLimit: true,
                trainingVideoLimit: true,
                trainingDocumentLimit: true,
                isEnterprise: true,
                trialDays: true,
              },
            },
          },
        });

        const { workspaceId, plan, ...remainingData } = existing;

        const stripePrice = plan?.stripePriceId
          ? await this.getPriceDetailsById(plan.stripePriceId)
          : undefined;     

        this.websocketService.sendToClient(workspaceId, 'subscriptionUpdated', {
          subscription: remainingData,
          plan:
            plan && stripePrice
              ? {
                  ...plan,
                  ...stripePrice,
                }
              : undefined,
        });

        if (existing.status === 'CANCELED') {
          await this.workspaceService.deactivateWorkspace(workspaceId);
        }

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.parent?.type === 'subscription_details') {
          const subscriptionId = invoice.parent.subscription_details.subscription;
          this.logger.warn(
            `Payment failed for subscription: ${subscriptionId} (Invoice ${invoice.id})`
          );

          if (!subscriptionId) {
            this.logger.warn(`No subscription found for failed invoice ${invoice.id}`);
            return;
          }

          const existing = await this.prisma.subscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId as string },
            select: {
              id: true,
              workspaceId: true,
              paymentRetryCount: true,
              status: true,
              currentPeriodEnd: true,
              trialEnd: true,
              featureOverrides: true,
              creditsLimitOverrides: true,
              agentLimitOverrides: true,
              trainingTextLimitOverrides: true,
              trainingWebsiteLimitOverrides: true,
              trainingVideoLimitOverrides: true,
              trainingDocumentLimitOverrides: true,
              cancelAtPeriodEnd: true,
              canceledAt: true,
              plan: {
                select: {
                  name: true,
                  stripePriceId: true,
                  description: true,
                  features: true,
                  creditsLimit: true,
                  agentLimit: true,
                  trainingTextLimit: true,
                  trainingWebsiteLimit: true,
                  trainingVideoLimit: true,
                  trainingDocumentLimit: true,
                  isEnterprise: true,
                  trialDays: true,
                },
              },
              workspace: {
                select: {
                  user: true
                }
              }
            },
          });

          if (!existing) return;

          const retryCount = (existing.paymentRetryCount ?? 0) + 1;

          await this.prisma.subscription.update({
            where: { id: existing.id },
            data: {
              status: 'PAST_DUE',
              paymentRetryCount: retryCount,
              lastPaymentFailedAt: new Date(),
            },
          });

          const owner = existing.workspace?.user;
          if (owner?.email) {

            const invoicerRetrieved = await this.stripe.invoices.retrieve(event.data.object.id, {
              expand: ['payment_intent'],
            }) as ExtendedInvoice;

            const portalUrl = await this.createCustomerPortal(existing.workspaceId);
            const failureMessage = undefined;
              invoicerRetrieved.payment_intent &&
              typeof invoicerRetrieved.payment_intent !== 'string' &&
              invoicerRetrieved.payment_intent.last_payment_error?.message;

            const reason = failureMessage || 'Unknown reason';

            await this.emailService.sendPaymentFailureEmail(
              owner.email,
              owner.name ?? 'User',
              reason,
              portalUrl
            );
          }

          const { workspaceId, plan, ...remainingData } = existing;

          const stripePrice = plan?.stripePriceId
            ? await this.getPriceDetailsById(plan.stripePriceId)
            : undefined;

          this.websocketService.sendToClient(workspaceId, 'subscriptionUpdated', {
            subscription: remainingData,
            plan:
              plan && stripePrice
                ? {
                    ...plan,
                    ...stripePrice,
                  }
                : undefined,
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        const customerId = invoice.customer as string;

        const workspace = await this.prisma.workspace.findFirst({
          where: { stripeCustomerId: customerId }
        });

        if (!workspace) {
          this.logger.warn(`Workspace not found for customer ${customerId} in invoice.payment_succeeded`);
        } else {
          // 📌 Reativar o workspace caso tenha sido desativado por pagamento atrasado
          const subscriptionRecord = await this.prisma.subscription.findFirst({
            where: {
              stripeSubscriptionId: (invoice as ExtendedInvoice).subscription as string,
              status: 'PAST_DUE',
            }
          });

          const plan = await this.prisma.plan.findFirst({
            where: { id: subscriptionRecord.planId }
          });

          if (subscriptionRecord) {
            await this.prisma.subscription.update({
              where: { id: subscriptionRecord.id },
              data: {
                status: 'ACTIVE',
                paymentRetryCount: 0,
                lastPaymentFailedAt: null,
              },
            });

            try {
              await this.workspaceService.activateWorkspace(workspace.id);
              this.logger.log(`Workspace ${workspace.id} reactivated after payment`);
            } catch (error) {
              this.logger.error(
                `Error to reactivate workspace ${workspace.id}: ${error.message}`
              );
            }
            
            // 🔄 Atualiza frontend via websocket
            const stripePrice = plan?.stripePriceId
              ? await this.getPriceDetailsById(plan.stripePriceId)
              : undefined;

            this.websocketService.sendToClient(
              workspace.id,
              'subscriptionUpdated',
              {
                subscription: subscriptionRecord,
                plan: plan && stripePrice
                  ? { ...plan, ...stripePrice }
                  : undefined,
              }
            ); 
          }           
        }

        const isOneTimeRecharge = invoice.lines?.data?.some((line) =>
          line.description?.toLowerCase().includes('smart recharge')
        );

        if (isOneTimeRecharge) {
          const customerId = invoice.customer as string;

          const workspace = await this.prisma.workspace.findFirst({
            where: { stripeCustomerId: customerId },
          });

          if (!workspace) {
            this.logger.warn(`Workspace not found for customer ${customerId}`);
            break;
          }

          const totalCents = invoice.amount_paid;
          const quantity = Math.floor(totalCents / PRICE_PER_CREDIT_CENTS);

          if (quantity <= 0) {
            this.logger.warn(
              `Invoice ${invoice.id} paid but amount is too low for credits`
            );
            break;
          }

          const existing = await this.prisma.extraCreditPurchase.findFirst({
            where: {
              metadata: {
                path: ['stripeInvoiceId'],
                equals: invoice.id,
              },
            },
          });

          if (!existing) {
            await this.prisma.extraCreditPurchase.create({
              data: {
                workspaceId: workspace.id,
                quantity,
                source: 'AUTOMATIC',
                metadata: {
                  stripeInvoiceId: invoice.id,
                  paidAt: new Date().toISOString(),
                },
              },
            });
          }

          const { planCreditsRemaining, extraCreditsRemaining } =
            await this.creditService.getWorkspaceRemainingCredits(workspace.id);

          this.websocketService.sendToClient(
            workspace.id,
            'workspaceCreditsUpdate',
            {
              planCredits: planCreditsRemaining,
              extraCredits: extraCreditsRemaining,
            }
          );

          this.logger.log(
            `Registered ${quantity} auto-credits for workspace ${workspace.id}`
          );
        }

        break;
      }

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
        break;
    }
  }
}


