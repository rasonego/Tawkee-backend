import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketService } from '../websocket/websocket.service';
import { StripeService } from '../stripe/stripe.service';

@Module({
  imports: [ConfigModule],
  controllers: [CreditController],
  providers: [CreditService, PrismaService, WebsocketService, StripeService],
  exports: [CreditService],
})
export class CreditModule {}
