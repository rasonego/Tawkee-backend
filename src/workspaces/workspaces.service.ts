import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketService } from 'src/websocket/websocket.service';
import { WorkspaceDto } from './dto/workspace.dto';

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
  SABIA_3: 1
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly websocketService: WebsocketService
  ) {}

  async findAll(): Promise<WorkspaceDto[]> {
    const workspaces = await this.prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    return workspaces;
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

  async getWorkspaceCredits(workspaceId: string): Promise<{ credits: number }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, credits: true },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace with ID ${workspaceId} not found`);
    }

    return { credits: workspace.credits };
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

  async getDashboardMetrics(workspaceId: string, startDate: string, endDate: string, comparisonStartDate: string, comparisonEndDate: string) {
    const start = new Date(startDate);
    const end = new Date(new Date(endDate).setUTCHours(23, 59, 59, 999));
    const prevStart = new Date(comparisonStartDate);
    const prevEnd = new Date(comparisonEndDate);

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

    const resolvedByAI = resolved.filter(i => i.userId === null);
    const resolvedByHuman = resolved.filter(i => i.userId !== null);

    const resolvedTimeSeriesMap: Record<string, { total: number; byAI: number; byHuman: number }> = {};
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
    const prevByAI = prevResolved.filter(i => i.userId === null).length;
    const prevByHuman = prevResolved.filter(i => i.userId !== null).length;

    const running = await this.prisma.interaction.findMany({
      where: {
        workspaceId,
        status: { in: ['RUNNING', 'WAITING'] },
        startAt: { gte: start, lte: end },
      },
      select: {
        status: true,
        chat: {
          select: {
            id: true,
            userName: true,
            whatsappPhone: true,
          },
        },
      },
    });

    const waiting = running.filter(i => i.status === 'WAITING');
    const runningInteractions = running.map(i => ({
      id: i.chat.id,
      userName: i.chat?.userName ?? null,
      whatsappPhone: i.chat?.whatsappPhone ?? null,
      isWaiting: i.status === 'WAITING',
    }));

    const prevRunning = await this.prisma.interaction.findMany({
      where: {
        workspaceId,
        status: { in: ['RUNNING', 'WAITING'] },
        startAt: { gte: prevStart, lte: prevEnd },
      },
      select: {
        status: true,
        startAt: true,
      },
    });

    const durations = resolved
      .filter(i => i.resolvedAt && i.startAt)
      .map(i => new Date(i.resolvedAt!).getTime() - new Date(i.startAt).getTime());

    const avgInteractionTimeMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const prevDurations = prevResolved
      .filter(i => i.resolvedAt && i.startAt)
      .map(i => new Date(i.resolvedAt!).getTime() - new Date(i.startAt).getTime());

    const prevAvgTime = prevDurations.length > 0 ? prevDurations.reduce((a, b) => a + b, 0) / prevDurations.length : 0;

    const credits = await this.prisma.creditSpent.findMany({
      where: {
        agent: { workspaceId },
        createdAt: { gte: start, lte: end },
      },
      select: {
        credits: true,
        model: true,
        agentId: true,
        createdAt: true,
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

    const creditByDate: Record<string, { totalCredits: number; creditsByAgent: Record<string, { credits: number; agentName: string | null }> }> = {};

    for (const c of credits) {
      const dateKey = c.createdAt.toISOString().slice(0, 10);
      if (!creditByDate[dateKey]) {
        creditByDate[dateKey] = { totalCredits: 0, creditsByAgent: {} };
      }

      creditByDate[dateKey].totalCredits += c.credits;

      if (!creditByDate[dateKey].creditsByAgent[c.agentId]) {
        creditByDate[dateKey].creditsByAgent[c.agentId] = {
          credits: 0,
          agentName: c.agent?.name ?? 'Unknown',
        };
      }

      creditByDate[dateKey].creditsByAgent[c.agentId].credits += c.credits;
    }

    const creditsPerDay = Object.entries(creditByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        totalCredits: data.totalCredits,
        creditsByAgent: Object.entries(data.creditsByAgent).map(([agentId, { credits, agentName }]) => ({
          agentId,
          agentName,
          credits,
        })),
      }));

    const agentTotals: Record<string, { agentId: string; name: string | null; jobName: string | null; avatar: string | null; totalCredits: number }> = {};
    for (const c of credits) {
      const id = c.agentId;
      if (!agentTotals[id]) {
        agentTotals[id] = {
          agentId: id,
          name: c.agent.name,
          jobName: c.agent.jobName,
          avatar: c.agent.avatar,
          totalCredits: 0,
        };
      }
      agentTotals[id].totalCredits += c.credits;
    }

    const topAgents = Object.values(agentTotals).sort((a, b) => b.totalCredits - a.totalCredits).slice(0, 5);

    const modelTotals: Record<string, number> = {};
    for (const c of credits) modelTotals[c.model] = (modelTotals[c.model] || 0) + c.credits;

    const topModels = Object.entries(modelTotals).map(([model, credits]) => ({ model, credits })).sort((a, b) => b.credits - a.credits).slice(0, 5);

    return {
      resolved: {
        total: resolved.length,
        byAI: resolvedByAI.length,
        byHuman: resolvedByHuman.length,
        timeSeries,
        trend: {
          total: prevTotal > 0 ? this.getTrend(resolved.length, prevTotal) : undefined,
          byAI: prevByAI > 0 ? this.getTrend(resolvedByAI.length, prevByAI) : undefined,
          byHuman: prevByHuman > 0 ? this.getTrend(resolvedByHuman.length, prevByHuman) : undefined,
        },
      },
      running: {
        total: running.length,
        waiting: waiting.length,
        interactions: runningInteractions,
      },
      avgInteractionTimeMs,
      avgTimeTrend: prevDurations.length > 0 ? this.getTrend(avgInteractionTimeMs, prevAvgTime) : undefined,
      creditsPerDay,
      topAgents,
      topModels,
    };
  }

  async checkAgentWorkspaceHasSufficientCredits(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        settings: true,
        workspace: {
          select: {
            id: true,
            credits: true,
          },
        },
      },
    });

    if (!agent?.settings || !agent.workspace) {
      throw new Error('Agent or workspace or settings not found.');
    }

    const model = agent.settings.preferredModel;
    const creditCost = modelCreditMap[model];

    if (!creditCost) {
      throw new Error(`Unknown model: ${model}`);
    }

    const currentCredits = agent.workspace.credits;

    console.log("credits situation: ", {
      agentId,
      workspaceId: agent.workspace.id,
      model,
      requiredCredits: creditCost,
      availableCredits: currentCredits,
      allowed: currentCredits >= creditCost,
    })

    return {
      agentId,
      workspaceId: agent.workspace.id,
      model,
      requiredCredits: creditCost,
      availableCredits: currentCredits,
      allowed: currentCredits >= creditCost,
    };
  }

  async logAndAggregateCredit(agentId: string, metadata?: Record<string, any>) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { 
        settings: true,
        workspace: {
          select: {
            id: true
          }
        }
      },
    })

    if (!agent?.settings) throw new Error('Agent or settings not found.')

    const model = agent.settings.preferredModel
    const creditCost = modelCreditMap[model]
    if (!creditCost) throw new Error(`Unknown model: ${model}`)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    const day = now.getDate()

    await this.prisma.$transaction(async (tx) => {
      // 1. Append credit transaction
      await tx.creditTransaction.create({
        data: {
          agentId,
          model,
          credits: creditCost,
          timestamp: now,
          metadata,
        },
      })

      // 2. Update or create aggregate summary
      const existing = await tx.creditSpent.findFirst({
        where: { agentId, model, year, month, day },
      })

      if (existing) {
        await tx.creditSpent.update({
          where: { id: existing.id },
          data: { credits: { increment: creditCost } },
        })
      } else {
        await tx.creditSpent.create({
          data: { agentId, model, credits: creditCost, year, month, day },
        })
      }

      // 3. Update credits on workspace
     const workspace = await this.prisma.workspace.update({
        where: { id: agent.workspace.id },
        data: {
          credits: { decrement: creditCost }
        },
        select: {
          id: true,
          credits: true
        }
      });

      // Inform frontend clients about credit consumption
      this.websocketService.sendToClient(
        workspace.id,
        'workspaceCreditsUpdate',
        {
          credits: workspace.credits,
        }
      );
    })
  }
}
