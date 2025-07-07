import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { WebsocketModule } from 'src/websocket/websocket.module';
import { CreditModule } from 'src/credits/credit.module';
import { WorkspacesModule } from 'src/workspaces/workspaces.module';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => CreditModule), // 👈 wrap with forwardRef
    forwardRef(() => WorkspacesModule),
    WebsocketModule,
    EmailModule,
  ],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
