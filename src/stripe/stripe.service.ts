// src/stripe/stripe.service.ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSubscriptionDto, CreatePlanDto } from './dto/stripe.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
    }

    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;
    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-05-28.basil',
    });
  }


  async createCustomer(
    workspaceId: string,
    email?: string,
    name?: string
  ): Promise<string> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { user: true },
      });

      if (!workspace) {
        throw new BadRequestException(`Workspace ${workspaceId} not found`);
      }

      const customer = await this.stripe.customers.create({
        email: email || workspace.user?.email,
        name: name || workspace.name,
        metadata: {
          workspaceId,
        },
      });

      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { stripeCustomerId: customer.id },
      });

      this.logger.log(
        `Created Stripe customer ${customer.id} for workspace ${workspaceId}`
      );
      return customer.id;
    } catch (error) {
      this.handleError(error, 'createCustomer');
      throw error;
    }
  }

  async createPlan(planData: CreatePlanDto): Promise<any> {
    try {
      // Criar produto no Stripe
      const product = await this.stripe.products.create({
        name: planData.name,
        description: planData.description,
        metadata: {
          isEnterprise: planData.isEnterprise?.toString() || 'false',
        },
      });

      // Criar preço no Stripe
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(planData.price * 100), // Converter para centavos
        currency: planData.currency || 'usd',
        recurring: {
          interval: planData.interval.toLowerCase() as 'month' | 'year',
          interval_count: planData.intervalCount || 1,
          trial_period_days: planData.trialDays,
        },
      });

      // Salvar no banco
      const plan = await this.prisma.plan.create({
        data: {
          name: planData.name,
          stripePriceId: price.id,
          stripeProductId: product.id,
          description: planData.description,
          price: planData.price,
          currency: planData.currency || 'USD',
          interval: planData.interval,
          intervalCount: planData.intervalCount || 1,
          features: planData.features || [],
          apiRequestLimit: planData.apiRequestLimit,
          agentLimit: planData.agentLimit,
          isEnterprise: planData.isEnterprise || false,
          trialDays: planData.trialDays,
        },
      });

      this.logger.log(
        `Created plan ${plan.name} with Stripe price ${price.id}`
      );
      return plan;
    } catch (error) {
      this.handleError(error, 'createPlan');
      throw error;
    }
  }

  async createCheckoutSession(
    subscriptionData: CreateSubscriptionDto
  ): Promise<string> {
    try {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: subscriptionData.workspaceId },
      });

      const plan = await this.prisma.plan.findUnique({
        where: { id: subscriptionData.planId },
      });

      if (!workspace || !plan) {
        throw new BadRequestException('Workspace or Plan not found');
      }

      let customerId = workspace.stripeCustomerId;
      if (!customerId) {
        customerId = await this.createCustomer(subscriptionData.workspaceId);
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url:
          subscriptionData.successUrl ||
          `${process.env.FRONTEND_URL}/dashboard?success=true`,
        cancel_url:
          subscriptionData.cancelUrl ||
          `${process.env.FRONTEND_URL}/plans?canceled=true`,
        metadata: {
          workspaceId: subscriptionData.workspaceId,
          planId: subscriptionData.planId,
        },
      });

      this.logger.log(
        `Created checkout session ${session.id} for workspace ${subscriptionData.workspaceId}`
      );
      return session.url!;
    } catch (error) {
      this.handleError(error, 'createCheckoutSession');
      throw error;
    }
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      // Verificar se já processamos este evento
      const existingWebhook = await this.prisma.stripeWebhook.findUnique({
        where: { stripeEventId: event.id },
      });

      if (existingWebhook) {
        this.logger.log(`Webhook ${event.id} already processed`);
        return;
      }

      // Registrar o webhook
      await this.prisma.stripeWebhook.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          data: event.data as any,
        },
      });

      // Processar o evento
      await this.processWebhookEvent(event);

      // Marcar como processado
      await this.prisma.stripeWebhook.update({
        where: { stripeEventId: event.id },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Successfully processed webhook ${event.id} of type ${event.type}`
      );
    } catch (error) {
      this.handleError(error, 'handleWebhook');

      // Registrar erro se possível
      try {
        const event = this.stripe.webhooks.constructEvent(
          payload,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!
        );

        await this.prisma.stripeWebhook.upsert({
          where: { stripeEventId: event.id },
          update: {
            processingError: error.message,
          },
          create: {
            stripeEventId: event.id,
            eventType: event.type,
            data: event.data as any,
            processingError: error.message,
          },
        });
      } catch (webhookError) {
        this.logger.error('Failed to save webhook error', webhookError);
      }

      throw error;
    }
  }

  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session
  ): Promise<void> {
    const workspaceId = session.metadata?.workspaceId;
    const planId = session.metadata?.planId;

    if (!workspaceId || !planId) {
      throw new Error('Missing metadata in checkout session');
    }

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string
    );
    await this.createOrUpdateSubscription(subscription, workspaceId, planId);
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription
  ): Promise<void> {
    const existingSubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      include: { workspace: true },
    });

    if (!existingSubscription) {
      this.logger.warn(`Subscription ${subscription.id} not found in database`);
      return;
    }

    await this.updateSubscriptionStatus(subscription);
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    // Atualizar workspace
    const dbSubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (dbSubscription) {
      await this.prisma.workspace.update({
        where: { id: dbSubscription.workspaceId },
        data: { subscriptionStatus: 'CANCELED' },
      });
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // Atualizar registros de uso, resetar limites, etc.
    this.logger.log(`Payment succeeded for invoice ${invoice.id}`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Notificar usuário, suspender serviços se necessário
    this.logger.log(`Payment failed for invoice ${invoice.id}`);
  }

  private async createOrUpdateSubscription(
    stripeSubscription: Stripe.Subscription,
    workspaceId: string,
    planId: string
  ): Promise<void> {
    const status = this.mapStripeStatus(stripeSubscription.status);

    const s = stripeSubscription as Stripe.Subscription & {
      current_period_start: number;
      current_period_end: number;
      trial_start?: number;
      trial_end?: number;
      customer: string;
    };

    await this.prisma.subscription.create({
      data: {
        workspaceId,
        planId,
        stripeSubscriptionId: s.id,
        stripeCustomerId: s.customer,
        status,
        currentPeriodStart: new Date(s.current_period_start * 1000),
        currentPeriodEnd: new Date(s.current_period_end * 1000),
        trialStart: s.trial_start ? new Date(s.trial_start * 1000) : null,
        trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null,
      },
    });

    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { subscriptionStatus: status },
    });
  }

  private async updateSubscriptionStatus(
    stripeSubscription: Stripe.Subscription
  ): Promise<void> {
    const status = this.mapStripeStatus(stripeSubscription.status);

    const s = stripeSubscription as Stripe.Subscription & {
      current_period_start: number;
      current_period_end: number;
      cancel_at_period_end?: boolean;
    };

    await this.prisma.subscription.update({
      where: { stripeSubscriptionId: s.id },
      data: {
        status,
        currentPeriodStart: new Date(s.current_period_start * 1000),
        currentPeriodEnd: new Date(s.current_period_end * 1000),
        cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
      },
    });

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: s.id },
    });

    if (subscription) {
      await this.prisma.workspace.update({
        where: { id: subscription.workspaceId },
        data: { subscriptionStatus: status },
      });
    }
  }

  private mapStripeStatus(stripeStatus: string): any {
    const statusMap: Record<string, any> = {
      active: 'ACTIVE',
      trialing: 'TRIAL',
      past_due: 'PAST_DUE',
      canceled: 'CANCELED',
      incomplete: 'INCOMPLETE',
      incomplete_expired: 'INCOMPLETE_EXPIRED',
      unpaid: 'UNPAID',
    };

    return statusMap[stripeStatus] || 'CANCELED';
  }

  async getSubscription(workspaceId: string): Promise<any> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    return subscription;
  }

  async cancelSubscription(
    workspaceId: string,
    cancelAtPeriodEnd = true
  ): Promise<void> {
    const subscription = await this.getSubscription(workspaceId);

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd,
    });

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd },
    });

    this.logger.log(
      `Subscription ${subscription.stripeSubscriptionId} marked for cancellation`
    );
  }

  async getPlans(): Promise<any[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async recordUsage(
    workspaceId: string,
    requestType: string,
    quantity = 1
  ): Promise<void> {
    const subscription = await this.getSubscription(workspaceId);

    await this.prisma.usageRecord.create({
      data: {
        workspaceId,
        subscriptionId: subscription?.id,
        requestType,
        quantity,
      },
    });
  }

  async getUsage(
    workspaceId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const where: any = { workspaceId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const usage = await this.prisma.usageRecord.groupBy({
      by: ['requestType'],
      where,
      _sum: { quantity: true },
    });

    return usage.reduce(
      (acc, record) => {
        acc[record.requestType] = record._sum.quantity || 0;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  private handleError(error: any, methodName: string): void {
    if (error instanceof Stripe.errors.StripeError) {
      this.logger.error(
        `Stripe error in ${methodName}: ${error.type} - ${error.message}`,
        error.stack
      );
    } else if (error.response) {
      this.logger.error(
        `API error in ${methodName}: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
      );
    } else {
      this.logger.error(
        `Error in ${methodName}: ${error.message}`,
        error.stack
      );
    }
  }
}
