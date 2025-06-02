import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { WahaApiModule } from '../waha-api/waha-api.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { DocumentsModule } from '../documents/documents.module';
import { WebsocketModule } from '../websocket/websocket.module';

@Module({
  imports: [
    PrismaModule,
    ConversationsModule,
    InteractionsModule,
    WahaApiModule,
    AuthModule,
    ConfigModule,
    DeepseekModule,
    DocumentsModule,
    WebsocketModule
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
