import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditService } from 'src/credits/credit.service';
import { PaginatedWorkspaceResponseDto, WorkspaceDto } from './dto/workspace.dto';
import { AIModel } from '@prisma/client';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export type OverrideValue = { value: number | null; explicitlySet: boolean };

export function hasExplicitValue(override: unknown): override is OverrideValue {
  return (
    typeof override === 'object' &&
    override !== null &&
    'explicitlySet' in override &&
    (override as OverrideValue).explicitlySet === true
  );
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditService: CreditService
  ) {}

  async findAll(paginationDto: PaginationDto): Promise<PaginatedWorkspaceResponseDto> {
    const { page = 1, pageSize = 3 } = paginationDto;
    const skip = (page - 1) * pageSize;

    const where = {
      isDeleted: false
    };

    const total = await this.prisma.workspace.count({ where });
    const totalPages = Math.ceil(total / pageSize);

    const workspaces = await this.prisma.workspace.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            plan: {
              select: {
                name: true,
              },
            },
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    const data = workspaces.map((ws) => {
      const subscription = ws.subscriptions?.[0] ?? null;

      return {
        id: ws.id,
        name: ws.name,
        createdAt: ws.createdAt.toISOString(),
        email: ws.user?.email ?? null,
        isActive: ws.isActive,
        subscription: subscription
          ? {
              status: subscription.status,
              plan: subscription.plan ? { name: subscription.plan.name } : undefined,
            }
          : null,
      };
    });

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      }
    };
  }

  async findOne(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace with ID ${id} not found`);
    }

    return workspace;
  }

  // When user finishes a chat using our platform, it does not necessarily mean it is resolved by human.
  // Conditions to assign a userId to a given interaction:
  // 1. The agent itself transfers attendance to human
  // 2. A user of our platform interferes and triggers start human attendance

  // The agent must transfer it to the first user of the given workspace it can
  // If there are multiple users, we must define rules to determine who must be assigned to.
  // Notification regarding this action should be fired - specific to the user being assigned to.

  private getTrend(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  }

  async getDashboardMetrics(
    workspaceId: string,
    startDate: string,
    endDate: string,
    comparisonStartDate: string,
    comparisonEndDate: string
  ) {
    const start = new Date(startDate);
    const end = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999));
    const prevStart = new Date(comparisonStartDate);
    const prevEnd = new Date(comparisonEndDate);

    // Resolved interactions (current period)
    const resolved = await this.prisma.interaction.findMany({
      where: {
        workspaceId,
        status: 'RESOLVED',
        resolvedAt: { gte: start, lte: end },
      },
      select: {
        id: true,
        userId: true,
        resolvedAt: true,
        startAt: true,
      },
    });

    const resolvedByAI = resolved.filter((i) => i.userId === null);
    const resolvedByHuman = resolved.filter((i) => i.userId !== null);

    const resolvedTimeSeriesMap: Record<
      string,
      { total: number; byAI: number; byHuman: number }
    > = {};
    for (const i of resolved) {
      const date = i.resolvedAt!.toISOString().slice(0, 10);
      if (!resolvedTimeSeriesMap[date]) {
        resolvedTimeSeriesMap[date] = { total: 0, byAI: 0, byHuman: 0 };
      }
      resolvedTimeSeriesMap[date].total++;
      if (i.userId === null) resolvedTimeSeriesMap[date].byAI++;
      else resolvedTimeSeriesMap[date].byHuman++;
    }

    const timeSeries = Object.entries(resolvedTimeSeriesMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // Resolved interactions (comparison period)
    const prevResolved = await this.prisma.interaction.findMany({
      where: {
        workspaceId,
        status: 'RESOLVED',
        resolvedAt: { gte: prevStart, lte: prevEnd },
      },
      select: {
        userId: true,
        resolvedAt: true,
        startAt: true,
      },
    });

    const prevTotal = prevResolved.length;
    const prevByAI = prevResolved.filter((i) => i.userId === null).length;
    const prevByHuman = prevResolved.filter((i) => i.userId !== null).length;

    // Active chats
    const activeChats = await this.prisma.interaction.findMany({
      where: {
        workspaceId,
        status: { not: 'RESOLVED' },
        startAt: { gte: start, lte: end },
      },
      select: {
        chatId: true,
        status: true,
        chat: {
          select: {
            id: true,
            userName: true,
            whatsappPhone: true,
          },
        },
      },
      distinct: ['chatId'],
    });

    const runningInteractions = activeChats.map((i) => ({
      id: i.chat.id,
      userName: i.chat.userName,
      whatsappPhone: i.chat.whatsappPhone,
      isWaiting: i.status === 'WAITING',
    }));

    const waiting = runningInteractions.filter((i) => i.isWaiting);

    const durations = resolved
      .filter((i) => i.resolvedAt && i.startAt)
      .map(
        (i) => new Date(i.resolvedAt!).getTime() - new Date(i.startAt).getTime()
      );

    const avgInteractionTimeMs =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

    const prevDurations = prevResolved
      .filter((i) => i.resolvedAt && i.startAt)
      .map(
        (i) => new Date(i.resolvedAt!).getTime() - new Date(i.startAt).getTime()
      );

    const prevAvgTime =
      prevDurations.length > 0
        ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length
        : 0;

    // Usage tracking (replaces creditSpent)
    const usageRecords = await this.prisma.usageRecord.findMany({
      where: {
        workspaceId,
        createdAt: { gte: start, lte: end },
      },
      select: {
        quantity: true,
        model: true,
        metadata: true,
        createdAt: true,
        agentId: true,
        agent: {
          select: {
            id: true,
            name: true,
            jobName: true,
            avatar: true,
          },
        },
      },
    });

    const creditByDate: Record<
      string,
      {
        totalCredits: number;
        creditsByAgent: Record<
          string,
          { credits: number; agentName: string | null }
        >;
      }
    > = {};

    const modelTotals: Partial<Record<AIModel, number>> = {};

    for (const record of usageRecords) {
      const dateKey = record.createdAt.toISOString().slice(0, 10);
      if (!creditByDate[dateKey]) {
        creditByDate[dateKey] = { totalCredits: 0, creditsByAgent: {} };
      }
      creditByDate[dateKey].totalCredits += record.quantity;

      if (record.agentId) {
        if (!creditByDate[dateKey].creditsByAgent[record.agentId]) {
          creditByDate[dateKey].creditsByAgent[record.agentId] = {
            credits: 0,
            agentName: record.agent?.name ?? 'Unknown',
          };
        }
        creditByDate[dateKey].creditsByAgent[record.agentId].credits +=
          record.quantity;
      }

      if (record.model) {
        modelTotals[record.model] =
          (modelTotals[record.model] || 0) + record.quantity;
      }
    }

    const creditsPerDay = Object.entries(creditByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        totalCredits: data.totalCredits,
        creditsByAgent: Object.entries(data.creditsByAgent).map(
          ([agentId, { credits, agentName }]) => ({
            agentId,
            agentName,
            credits,
          })
        ),
      }));

    const agentTotals: Record<
      string,
      {
        agentId: string;
        name: string | null;
        jobName: string | null;
        avatar: string | null;
        totalCredits: number;
      }
    > = {};

    for (const record of usageRecords) {
      const id = record.agentId;
      if (!id) continue;
      if (!agentTotals[id]) {
        agentTotals[id] = {
          agentId: id,
          name: record.agent?.name ?? null,
          jobName: record.agent?.jobName ?? null,
          avatar: record.agent?.avatar ?? null,
          totalCredits: 0,
        };
      }
      agentTotals[id].totalCredits += record.quantity;
    }

    const topAgents = Object.values(agentTotals)
      .sort((a, b) => b.totalCredits - a.totalCredits)
      .slice(0, 5);

    const topModels = Object.entries(modelTotals)
      .map(([model, credits]) => ({ model, credits }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5);

    return {
      resolved: {
        total: resolved.length,
        byAI: resolvedByAI.length,
        byHuman: resolvedByHuman.length,
        timeSeries,
        trend: {
          total:
            prevTotal > 0
              ? this.getTrend(resolved.length, prevTotal)
              : undefined,
          byAI:
            prevByAI > 0
              ? this.getTrend(resolvedByAI.length, prevByAI)
              : undefined,
          byHuman:
            prevByHuman > 0
              ? this.getTrend(resolvedByHuman.length, prevByHuman)
              : undefined,
        },
      },
      running: {
        total: runningInteractions.length,
        waiting: waiting.length,
        interactions: runningInteractions,
      },
      avgInteractionTimeMs,
      avgTimeTrend:
        prevDurations.length > 0
          ? this.getTrend(avgInteractionTimeMs, prevAvgTime)
          : undefined,
      creditsPerDay,
      topAgents,
      topModels,
    };
  }

  async getDetailedWorkspace(workspaceId: string): Promise<any> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            plan: true,
          },
        },
        agents: {
          include: {
            channels: true,
          },
        },
        user: true
      },
    });

    if (!ws) {
      throw new Error(`Workspace with ID ${workspaceId} not found`);
    }

    const { planCreditsRemaining, extraCreditsRemaining } =
      await this.creditService.getWorkspaceRemainingCredits(ws.id);

    const subscription = ws.subscriptions[0] || null;

    return {
      id: ws.id,
      name: ws.name,
      createdAt: ws.createdAt.toISOString(),
      workspacePlanCredits: planCreditsRemaining ?? 0,
      workspaceExtraCredits: extraCreditsRemaining ?? 0,
      subscription: subscription
        ? {
            id: subscription.id,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
            stripeCustomerId: subscription.stripeCustomerId,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart.toISOString(),
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            trialStart: subscription.trialStart?.toISOString() ?? null,
            trialEnd: subscription.trialEnd?.toISOString() ?? null,
            featureOverrides: subscription.featureOverrides ?? null,
            ...(hasExplicitValue(subscription.agentLimitOverrides)
              ? { agentLimitOverrides: subscription.agentLimitOverrides.value }
              : {}),
            ...(hasExplicitValue(subscription.creditsLimitOverrides)
              ? { creditsLimitOverrides: subscription.creditsLimitOverrides.value }
              : {}),            
            ...(hasExplicitValue(subscription.trainingTextLimitOverrides)
              ? { trainingTextLimitOverrides: subscription.trainingTextLimitOverrides.value }
              : {}),
            ...(hasExplicitValue(subscription.trainingWebsiteLimitOverrides)
              ? { trainingWebsiteLimitOverrides: subscription.trainingWebsiteLimitOverrides.value }
              : {}),
            ...(hasExplicitValue(subscription.trainingDocumentLimitOverrides)
              ? { trainingDocumentLimitOverrides: subscription.trainingDocumentLimitOverrides.value }
              : {}),
            ...(hasExplicitValue(subscription.trainingVideoLimitOverrides)
              ? { trainingVideoLimitOverrides: subscription.trainingVideoLimitOverrides.value }
              : {}),
            plan: subscription.plan && {
              name: subscription.plan.name,
              stripePriceId: subscription.plan.stripePriceId,
              stripeProductId: subscription.plan.stripeProductId,
              description: subscription.plan.description,
              features: subscription.plan.features,
              creditsLimit: subscription.plan.creditsLimit,
              agentLimit: subscription.plan.agentLimit,
              trainingTextLimit: subscription.plan.trainingTextLimit,
              trainingWebsiteLimit: subscription.plan.trainingWebsiteLimit,
              trainingVideoLimit: subscription.plan.trainingVideoLimit,
              trainingDocumentLimit: subscription.plan.trainingDocumentLimit,
              isEnterprise: subscription.plan.isEnterprise,
              trialDays: subscription.plan.trialDays,
            },
          }
        : null,
      agents: ws.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        isActive: agent.isActive,
        channels: agent.channels.map((channel) => ({
          id: channel.id,
          name: channel.name,
          connected: channel.connected,
        })),
      })),
      users: ws.user
        ? [
            {
              id: ws.user.id,
              name: ws.user.name,
              email: ws.user.email,
              workspaceId: ws.id,
              avatar: ws.user.avatar,
              provider: ws.user.provider,
              emailVerified: ws.user.emailVerified,
              createdAt: ws.user.createdAt.toISOString(),
            },
          ]
        : []
    };
  }
}
