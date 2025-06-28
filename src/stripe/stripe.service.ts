import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { CreatePlanFromStripeDto } from './dto/create-plan-from-stripe.dto';
import { WebsocketService } from 'src/websocket/websocket.service';
import { CreditService } from 'src/credits/credit.service';
import { UpdatePlanFromFormDto } from './dto/update-plan-from-form.dto';
import { UpdateSubscriptionOverridesDto } from './dto/update-subscription-overrides.dto';

const PRICE_PER_CREDIT_CENTS = 4;

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(StripeService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,

    @Inject(forwardRef(() => CreditService))
    private creditService: CreditService,

    private websocketService: WebsocketService
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      {
        apiVersion: '2025-05-28.basil',
      }
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
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.parent?.type === 'subscription_details') {
          const subscriptionId =
            invoice.parent.subscription_details.subscription;
          console.log(
            `Pagamento falhou para a assinatura: ${subscriptionId} (Invoice ${invoice.id})`
          );

          if (!subscriptionId) {
            this.logger.warn(
              `No subscription found for failed invoice ${invoice.id}`
            );
            return;
          }

          await this.prisma.subscription.updateMany({
            where: { stripeSubscriptionId: subscriptionId as string },
            data: { status: 'PAST_DUE' },
          });

          const existing = await this.prisma.subscription.findFirst({
            where: { stripeSubscriptionId: subscriptionId as string },
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

          this.websocketService.sendToClient(
            workspaceId,
            'subscriptionUpdated',
            {
              subscription: remainingData,
              plan:
                plan && stripePrice
                  ? {
                      ...plan,
                      ...stripePrice,
                    }
                  : undefined,
            }
          );

          this.logger.warn(
            `Payment failed for subscription: ${subscriptionId}`
          );
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

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
