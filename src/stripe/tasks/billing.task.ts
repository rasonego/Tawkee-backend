import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../stripe.service';

@Injectable()
export class BillingTaskService {
  private readonly logger = new Logger(BillingTaskService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkExpiredTrials() {
    const expiredTrials = await this.prisma.subscription.findMany({
      where: {
        status: 'TRIAL',
        trialEnd: {
          lt: new Date(),
        },
      },
      include: { workspace: true },
    });

    for (const subscription of expiredTrials) {
      try {
        // Atualizar status
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'PAST_DUE' },
        });

        await this.prisma.workspace.update({
          where: { id: subscription.workspaceId },
          data: { subscriptionStatus: 'PAST_DUE' },
        });

        this.logger.log(
          `Trial expired for workspace ${subscription.workspaceId}`
        );
      } catch (error) {
        this.logger.error(`Failed to update expired trial: ${error.message}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncSubscriptionStatuses() {
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
      },
    });

    for (const subscription of activeSubscriptions) {
      try {
        const stripeSubscription = await this.stripeService[
          'stripe'
        ].subscriptions.retrieve(subscription.stripeSubscriptionId);

        const newStatus = this.mapStripeStatus(stripeSubscription.status);

        if (newStatus !== subscription.status) {
          await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: newStatus },
          });

          await this.prisma.workspace.update({
            where: { id: subscription.workspaceId },
            data: { subscriptionStatus: newStatus },
          });

          this.logger.log(
            `Updated subscription ${subscription.id} status to ${newStatus}`
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to sync subscription ${subscription.id}: ${error.message}`
        );
      }
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

  @Cron('0 0 1 * *') // Todo dia 1 do mês
  async resetUsageCounters() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const subscription of subscriptions) {
      // Opcional: Arquivar dados de uso do mês anterior
      await this.archiveMonthlyUsage(subscription.workspaceId);
    }

    this.logger.log('Monthly usage reset completed');
  }

  private async archiveMonthlyUsage(workspaceId: string) {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);

    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await this.prisma.usageRecord.groupBy({
      by: ['requestType'],
      where: {
        workspaceId,
        createdAt: {
          gte: lastMonth,
          lt: currentMonth,
        },
      },
      _sum: { quantity: true },
    });

    // Aqui você pode salvar em uma tabela de histórico se necessário
    this.logger.log(
      `Archived usage for workspace ${workspaceId}: ${JSON.stringify(monthlyUsage)}`
    );
  }
}
