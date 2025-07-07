import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketService } from '../websocket/websocket.service';
import { StripeService } from '../stripe/stripe.service';
import { v4 as uuidv4 } from 'uuid';
import { RequestType } from '@prisma/client';
import {
  eachDayOfInterval,
  endOfDay,
  isAfter,
  isBefore,
  parseISO,
  startOfDay,
} from 'date-fns';
import { OverrideValue } from 'src/workspaces/workspaces.service';

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

    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService
  ) {}

  async getWorkspaceRemainingCredits(workspaceId: string) {
    let planCreditsRemaining = 0;
    let extraCreditsRemaining = 0;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: { in: ['ACTIVE', 'TRIAL', 'CANCELED'] },
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
      const subscriptionCreditsLimitOverrides =
        subscription?.creditsLimitOverrides as OverrideValue;

      const unlimitedCredits = subscriptionCreditsLimitOverrides?.explicitlySet
        ? subscriptionCreditsLimitOverrides.value == 'UNLIMITED'
        : subscription.plan.creditsLimit == null;

      const totalPlan = subscriptionCreditsLimitOverrides?.explicitlySet
        ? subscriptionCreditsLimitOverrides.value
        : subscription.plan.creditsLimit;

      planCreditsRemaining = unlimitedCredits
        ? Infinity
        : Math.max(0, (totalPlan as number) - usedPlan);
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

  private isOverrideValue(obj: unknown): obj is OverrideValue {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'value' in obj &&
      'explicitlySet' in obj &&
      (typeof (obj as any).value === 'number' || (obj as any).value === null) &&
      typeof (obj as any).explicitlySet === 'boolean'
    );
  }

  async getDailyCreditBalanceInCurrentPeriod(
    workspaceId: string,
    startDate?: string,
    endDate?: string
  ): Promise<
    {
      date: string;
      planCreditsRemaining: number;
      extraCreditsRemaining: number;
    }[]
  > {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId,
        status: { in: ['ACTIVE', 'TRIAL', 'CANCELED'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) return [];

    const {
      currentPeriodStart,
      currentPeriodEnd,
      plan,
      creditsLimitOverrides,
    } = subscription;

    const typedCreditsLimitOverrides = creditsLimitOverrides as OverrideValue;

    const unlimitedCredits = typedCreditsLimitOverrides?.explicitlySet
      ? typedCreditsLimitOverrides.value == 'UNLIMITED'
      : plan.creditsLimit == null;

    if (unlimitedCredits) {
      // Unlimited plan, skip computation
      return [];
    }

    const effectiveLimit = typedCreditsLimitOverrides?.explicitlySet
      ? typedCreditsLimitOverrides.value
      : plan.creditsLimit;

    const start = startOfDay(
      startDate ? parseISO(startDate) : currentPeriodStart
    );
    const end = endOfDay(endDate ? parseISO(endDate) : currentPeriodEnd);

    const clampedStart = isBefore(start, currentPeriodStart)
      ? startOfDay(currentPeriodStart)
      : start;
    const clampedEnd = isAfter(end, currentPeriodEnd)
      ? endOfDay(currentPeriodEnd)
      : end;

    const days = eachDayOfInterval({ start: clampedStart, end: clampedEnd });

    const usageRecords = await this.prisma.usageRecord.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: clampedStart,
          lte: clampedEnd,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const extraPurchases = await this.prisma.extraCreditPurchase.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });

    const usageMap = new Map<string, { plan: number; extra: number }>();
    for (const record of usageRecords) {
      const day = startOfDay(record.createdAt).toISOString().split('T')[0];
      const existing = usageMap.get(day) ?? { plan: 0, extra: 0 };

      if (record.usedFrom === 'PLAN') {
        existing.plan += record.quantity;
      } else if (record.usedFrom === 'EXTRA') {
        existing.extra += record.quantity;
      }

      usageMap.set(day, existing);
    }

    const result = [];
    let cumulativePlanUsed = 0;
    let cumulativeExtraUsed = 0;

    for (const date of days) {
      const iso = date.toISOString().split('T')[0];
      const usage = usageMap.get(iso) ?? { plan: 0, extra: 0 };

      cumulativePlanUsed += usage.plan;
      cumulativeExtraUsed += usage.extra;

      // Sum only extra purchases available up to and including this date
      const extraCreditsAvailable = extraPurchases
        .filter((p) => startOfDay(p.createdAt) <= date)
        .reduce((sum, p) => sum + p.quantity, 0);

      result.push({
        date: iso,
        planCreditsRemaining: Math.max(
          0,
          (effectiveLimit as number) - cumulativePlanUsed
        ),
        extraCreditsRemaining: Math.max(
          0,
          extraCreditsAvailable - cumulativeExtraUsed
        ),
      });
    }

    return result;
  }

  async checkAgentWorkspaceHasSufficientCredits(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        settings: true,
        workspace: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIAL', 'CANCELED'] } },
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (
      !agent?.settings ||
      !agent.workspace ||
      !agent.workspace.subscriptions[0]
    ) {
      throw new Error('Agent, workspace, subscription, or settings not found.');
    }

    const model = agent.settings.preferredModel;
    const creditCost = modelCreditMap[model];
    if (!creditCost) {
      throw new Error(`Unknown model: ${model}`);
    }

    const workspaceId = agent.workspace.id;

    // ✅ Reuse shared method for credit balances
    const { planCreditsRemaining, extraCreditsRemaining } =
      await this.getWorkspaceRemainingCredits(workspaceId);

    const totalAvailable = planCreditsRemaining + extraCreditsRemaining;
    const allowed = totalAvailable >= creditCost;

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
        settings: {
          select: {
            preferredModel: true,
          },
        },
        workspace: {
          include: {
            subscriptions: {
              include: { plan: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (
      !agent?.settings ||
      !agent.workspace ||
      !agent.workspace.subscriptions[0]
    ) {
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

    const subscriptionCreditsLimitOverrides =
      subscription.creditsLimitOverrides as OverrideValue;

    const unlimitedCredits = subscriptionCreditsLimitOverrides?.explicitlySet
      ? subscriptionCreditsLimitOverrides.value == 'UNLIMITED'
      : subscription.plan.creditsLimit == null;

    const totalPlanCredits = subscriptionCreditsLimitOverrides?.explicitlySet
      ? subscriptionCreditsLimitOverrides.value
      : subscription.plan.creditsLimit;

    let remainingPlanCredits = unlimitedCredits
      ? Infinity
      : Math.max(0, (totalPlanCredits as number) - usedPlanCredits);

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

    let remainingExtraCredits = Math.max(
      0,
      (totalExtraCredits._sum.quantity ?? 0) -
        (extraCreditsUsed._sum.quantity ?? 0)
    );

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

    console.log({ remainingPlanCredits, remainingExtraCredits });

    this.websocketService.sendToClient(workspaceId, 'workspaceCreditsUpdate', {
      planCredits: remainingPlanCredits,
      extraCredits: remainingExtraCredits,
    });

    await this.handleSmartRechargeIfNeeded(
      workspaceId,
      remainingPlanCredits,
      remainingExtraCredits
    );
  }

  private async handleSmartRechargeIfNeeded(
    workspaceId: string,
    remainingPlanCredits: number,
    remainingExtraCredits: number
  ) {
    const setting = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId },
    });

    const remainingCredits: number =
      remainingPlanCredits + remainingExtraCredits;

    if (!setting || !setting.active || remainingCredits >= setting.threshold) {
      return;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace?.stripeCustomerId) {
      throw new Error('Cannot process recharge: missing Stripe customer ID');
    }

    const invoice = await this.stripeService.createAndPayInvoiceWithItem({
      customer: workspace.stripeCustomerId,
      amount: setting.rechargeAmount,
      currency: 'usd',
      description: `Smart Recharge: ${setting.rechargeAmount} extra credits`,
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
          },
        },
      });

      const { planCreditsRemaining, extraCreditsRemaining } =
        await this.getWorkspaceRemainingCredits(workspaceId);

      this.websocketService.sendToClient(
        workspaceId,
        'workspaceCreditsUpdate',
        {
          planCredits: planCreditsRemaining,
          extraCredits: extraCreditsRemaining,
        }
      );
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
