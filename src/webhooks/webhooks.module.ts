import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { EvolutionApiModule } from '../evolution-api/evolution-api.module';
import { WahaApiModule } from '../waha-api/waha-api.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { OpenAiModule } from '../openai/openai.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    PrismaModule,
    ConversationsModule,
    EvolutionApiModule,
    WahaApiModule,
    AuthModule,
    ConfigModule,
    OpenAiModule, // Added OpenAiModule for OpenAI integration
    DocumentsModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
