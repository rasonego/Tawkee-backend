import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2
  ) {}

  async processQueuedWebhooks(): Promise<void> {
    const pendingWebhooks = await this.prisma.stripeWebhook.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: 10, // Processar em lotes
    });

    for (const webhook of pendingWebhooks) {
      try {
        await this.processWebhook(webhook);

        await this.prisma.stripeWebhook.update({
          where: { id: webhook.id },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        });

        this.logger.log(`Processed queued webhook ${webhook.stripeEventId}`);
      } catch (error) {
        this.logger.error(
          `Failed to process webhook ${webhook.stripeEventId}:`,
          error
        );

        await this.prisma.stripeWebhook.update({
          where: { id: webhook.id },
          data: { processingError: error.message },
        });
      }
    }
  }

  private async processWebhook(webhook: any): Promise<void> {
    // Emitir eventos para diferentes handlers
    this.eventEmitter.emit(`stripe.${webhook.eventType}`, webhook.data);

    // Log para monitoramento
    this.logger.log(`Processing webhook: ${webhook.eventType}`);
  }
}
