import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketService } from '../websocket/websocket.service';
import { StripeService } from '../stripe/stripe.service';
import { v4 as uuidv4 } from 'uuid';
import { RequestType } from '@prisma/client';

const modelCreditMap: Record<string, number> = {
  GPT_4_1: 20,
  GPT_4_1_MINI: 10,
  GPT_4_O_MINI: 10,
  GPT_4_O: 10,
  OPEN_AI_O3_MINI: 1,
  OPEN_AI_O4_MINI: 10,
  OPEN_AI_O3: 1,
  OPEN_AI_O1: 1,
  GPT_4: 20,
  CLAUDE_3_5_SONNET: 10,
  CLAUDE_3_7_SONNET: 10,
  CLAUDE_3_5_HAIKU: 1,
  DEEPINFRA_LLAMA3_3: 1,
  QWEN_2_5_MAX: 1,
  DEEPSEEK_CHAT: 1,
  SABIA_3: 1,
};


@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websocketService: WebsocketService,
    private readonly stripeService: StripeService,
  ) {}
 
  async getWorkspaceRemainingCredits(workspaceId: string) {
    let planCreditsRemaining = 0;
    let extraCreditsRemaining = 0;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (subscription) {
      const { currentPeriodStart, currentPeriodEnd } = subscription;

      const planUsage = await this.prisma.usageRecord.aggregate({
        _sum: { quantity: true },
        where: {
          workspaceId,
          usedFrom: 'PLAN',
          requestType: RequestType.API_CALL,
          createdAt: {
            gte: currentPeriodStart,
            lt: currentPeriodEnd,
          },
        },
      });

      const usedPlan = planUsage._sum.quantity ?? 0;
      const totalPlan = subscription.plan.creditsLimit ?? 0;
      planCreditsRemaining = Math.max(0, totalPlan - usedPlan);
    }

    const purchasedExtra = await this.prisma.extraCreditPurchase.aggregate({
      _sum: { quantity: true },
      where: { workspaceId },
    });

    const usedExtra = await this.prisma.usageRecord.aggregate({
      _sum: { quantity: true },
      where: {
        workspaceId,
        usedFrom: 'EXTRA',
      },
    });

    const totalExtra = purchasedExtra._sum.quantity ?? 0;
    const spentExtra = usedExtra._sum.quantity ?? 0;
    extraCreditsRemaining = Math.max(0, totalExtra - spentExtra);

    return { planCreditsRemaining, extraCreditsRemaining };
  }

  async checkAgentWorkspaceHasSufficientCredits(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        settings: true,
        workspace: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIAL'] } },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!agent?.settings || !agent.workspace || !agent.workspace.subscriptions[0]) {
      throw new Error('Agent, workspace, subscription, or settings not found.');
    }

    const model = agent.settings.preferredModel;
    const creditCost = modelCreditMap[model];
    if (!creditCost) {
      throw new Error(`Unknown model: ${model}`);
    }

    const workspaceId = agent.workspace.id;

    // ✅ Reuse shared method for credit balances
    const { planCreditsRemaining, extraCreditsRemaining } = await this.getWorkspaceRemainingCredits(workspaceId);

    const totalAvailable = planCreditsRemaining + extraCreditsRemaining;
    const allowed = totalAvailable >= creditCost;

    console.log('credits situation: ', {
      agentId,
      workspaceId,
      model,
      requiredCredits: creditCost,
      planCreditsAvailable: planCreditsRemaining,
      extraCreditsAvailable: extraCreditsRemaining,
      allowed,
    });

    return {
      agentId,
      workspaceId,
      model,
      requiredCredits: creditCost,
      planCreditsAvailable: planCreditsRemaining,
      extraCreditsAvailable: extraCreditsRemaining,
      allowed,
    };
  }

  async logAndAggregateCredit(agentId: string, metadata?: Record<string, any>) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        settings: true,
        workspace: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIAL'] } },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!agent?.settings || !agent.workspace || !agent.workspace.subscriptions[0]) {
      throw new Error('Agent, workspace, subscription, or settings not found.');
    }

    const model = agent.settings.preferredModel;
    const creditCost = modelCreditMap[model];
    if (!creditCost) throw new Error(`Unknown model: ${model}`);

    const now = new Date();
    const subscription = agent.workspace.subscriptions[0];
    const workspaceId = agent.workspace.id;

    const usageAggregate = await this.prisma.usageRecord.aggregate({
      _sum: { quantity: true },
      where: {
        workspaceId,
        createdAt: {
          gte: subscription.currentPeriodStart,
          lt: subscription.currentPeriodEnd,
        },
      },
    });

    const usedPlanCredits = usageAggregate._sum.quantity ?? 0;
    const totalPlanCredits = subscription.plan.creditsLimit ?? 0;
    let remainingPlanCredits = Math.max(0, totalPlanCredits - usedPlanCredits);

    const extraCreditsUsed = await this.prisma.usageRecord.aggregate({
      _sum: { quantity: true },
      where: {
        workspaceId,
        usedFrom: 'EXTRA',
      },
    });

    const totalExtraCredits = await this.prisma.extraCreditPurchase.aggregate({
      _sum: { quantity: true },
      where: { workspaceId },
    });

    let remainingExtraCredits =
      (totalExtraCredits._sum.quantity ?? 0) - (extraCreditsUsed._sum.quantity ?? 0);

    const creditEventId = uuidv4();
    const records = [];

    if (remainingPlanCredits >= creditCost) {
      records.push({
        workspaceId,
        subscriptionId: subscription.id,
        agentId: agent.id,
        requestType: 'API_CALL',
        model,
        quantity: creditCost,
        metadata: { ...metadata, creditEventId },
        createdAt: now,
        usedFrom: 'PLAN',
      });
      remainingPlanCredits -= creditCost;
    } else {
      if (remainingPlanCredits > 0) {
        records.push({
          workspaceId,
          subscriptionId: subscription.id,
          agentId: agent.id,
          requestType: 'API_CALL',
          model,
          quantity: remainingPlanCredits,
          metadata: { ...metadata, creditEventId },
          createdAt: now,
          usedFrom: 'PLAN',
        });
      }
      const extraAmount = creditCost - remainingPlanCredits;
      records.push({
        workspaceId,
        subscriptionId: subscription.id,
        agentId: agent.id,
        requestType: 'API_CALL',
        model,
        quantity: extraAmount,
        metadata: { ...metadata, creditEventId },
        createdAt: now,
        usedFrom: 'EXTRA',
      });

      remainingPlanCredits = 0;
      remainingExtraCredits -= extraAmount;
    }

    await this.prisma.usageRecord.createMany({ data: records });

    await this.handleSmartRechargeIfNeeded(workspaceId, remainingExtraCredits);

    this.websocketService.sendToClient(workspaceId, 'workspaceCreditsUpdate', {
      planCredits: remainingPlanCredits,
      extraCredits: remainingExtraCredits,
    });
  }

  private async handleSmartRechargeIfNeeded(workspaceId: string, remainingExtraCredits: number) {
    const setting = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId },
    });

    if (!setting || !setting.active || remainingExtraCredits >= setting.threshold) {
      return;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace?.stripeCustomerId) {
      throw new Error('Cannot process recharge: missing Stripe customer ID');
    }

    const amountInCents = setting.rechargeAmount * 100;

    const invoiceItem = await this.stripeService.createInvoiceItem({
      customer: workspace.stripeCustomerId,
      amount: amountInCents,
      currency: 'usd',
      description: `Smart Recharge: ${setting.rechargeAmount} extra credits`,
    });

    const invoice = await this.stripeService.createAndPayInvoice({
      customer: workspace.stripeCustomerId,
    });

    if (invoice.status === 'paid') {
      await this.prisma.extraCreditPurchase.create({
        data: {
          workspaceId,
          quantity: setting.rechargeAmount,
          source: 'AUTOMATIC',
          metadata: {
            triggeredAt: new Date().toISOString(),
            stripeInvoiceId: invoice.id,
            stripeInvoiceItemId: invoiceItem.id,
          },
        },
      });
    }
  }

  async updateSmartRechargeSetting(
    workspaceId: string,
    updates: {
      threshold?: number;
      rechargeAmount?: number;
      active?: boolean;
    }
  ) {
    const setting = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId },
    });

    if (!setting) {
      throw new Error('Smart Recharge setting not found for this workspace');
    }

    const updatedSetting = await this.prisma.smartRechargeSetting.update({
      where: { workspaceId },
      data: {
        threshold: updates.threshold ?? setting.threshold,
        rechargeAmount: updates.rechargeAmount ?? setting.rechargeAmount,
        active: updates.active ?? setting.active,
      },
    });

    return updatedSetting;
  }  
}
