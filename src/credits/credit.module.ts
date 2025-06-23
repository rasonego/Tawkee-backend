import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { WebsocketModule } from 'src/websocket/websocket.module';

@Module({
  imports: [ConfigModule, WebsocketModule],
  controllers: [CreditController],
  providers: [CreditService, PrismaService, StripeService],
  exports: [CreditService],
})
export class CreditModule {}
