import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionListener {
  private readonly logger = new Logger(SubscriptionListener.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent('stripe.customer.subscription.created')
  async handleSubscriptionCreated(data: any) {
    this.logger.log(`New subscription created: ${data.object.id}`);
    // Enviar email de boas-vindas, configurar recursos, etc.
  }

  @OnEvent('stripe.customer.subscription.updated')
  async handleSubscriptionUpdated(data: any) {
    this.logger.log(`Subscription updated: ${data.object.id}`);
    // Notificar mudanças no plano
  }

  @OnEvent('stripe.customer.subscription.deleted')
  async handleSubscriptionDeleted(data: any) {
    this.logger.log(`Subscription canceled: ${data.object.id}`);
    // Desativar recursos, backup de dados, etc.
  }

  @OnEvent('stripe.invoice.payment_failed')
  async handlePaymentFailed(data: any) {
    this.logger.log(`Payment failed for invoice: ${data.object.id}`);

    const subscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: data.object.subscription },
      include: { workspace: { include: { user: true } } },
    });

    if (subscription) {
      // Enviar notificação de falha no pagamento
      // Implementar lógica de retry ou suspensão
    }
  }
}
