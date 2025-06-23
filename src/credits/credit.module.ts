import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketModule } from 'src/websocket/websocket.module';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => StripeModule), // 👈 wrap with forwardRef
    WebsocketModule,
  ],
  controllers: [CreditController],
  providers: [CreditService, PrismaService],
  exports: [CreditService],
})
export class CreditModule {}
