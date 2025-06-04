import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { AgentsModule } from './agents/agents.module';
import { TrainingsModule } from './trainings/trainings.module';
import { IntentionsModule } from './intentions/intentions.module';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaModule } from './prisma/prisma.module';
import { AgentSettingsModule } from './agent-settings/agent-settings.module';
import { AgentWebhooksModule } from './agent-webhooks/agent-webhooks.module';
import { ChatsModule } from './chats/chats.module';
import { InteractionsModule } from './interactions/interactions.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { HealthModule } from './health/health.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { EvolutionApiModule } from './evolution-api/evolution-api.module';
import { WahaApiModule } from './waha-api/waha-api.module';
import { OpenAiModule } from './openai/openai.module';
import { DeepseekModule } from './deepseek/deepseek.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { MediaModule } from './media/media.module';
import { WebsocketModule } from './websocket/websocket.module';
import { UsersModule } from './users/users.module';
import { GoogleCalendarOAuthModule } from './intentions/google-calendar/google-calendar-oauth.module';
import * as Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // Database URL is required for the application to work
        DATABASE_URL: Joi.string().required(),

        // JWT secrets required for authentication
        JWT_SECRET: Joi.string().required(),

        // Evolution API credentials - only required for WhatsApp integration
        // We'll make these optional to allow the application to start without WhatsApp integration
        EVOLUTION_API_URL: Joi.string()
          .uri()
          .optional()
          .description('The URL of the Evolution API server'),
        EVOLUTION_API_KEY: Joi.string()
          .optional()
          .description('The API key for authenticating with Evolution API'),

        // Optional webhook token for added security
        WEBHOOK_TOKEN: Joi.string()
          .optional()
          .description('Optional token for securing webhook endpoints'),

        // Server address for creating webhook URLs
        OUR_ADDRESS: Joi.string()
          .uri()
          .optional()
          .default('http://localhost:5000')
          .description(
            'The publicly accessible URL of this server for webhooks'
          ),

        // OpenAI API key for generating responses
        OPENAI_API_KEY: Joi.string()
          .optional()
          .description('API key for OpenAI to generate responses'),
      }),
      validationOptions: {
        abortEarly: true,
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    WorkspacesModule,
    AgentsModule,
    AgentSettingsModule,
    AgentWebhooksModule,
    TrainingsModule,
    IntentionsModule,
    ConversationsModule,
    ChatsModule,
    InteractionsModule,
    AuthModule,
    UsersModule,
    ChannelsModule,
    HealthModule,
    WebhooksModule,
    EvolutionApiModule,
    WahaApiModule,
    OpenAiModule,
    DeepseekModule,
    QdrantModule,
    MediaModule,
    WebsocketModule,
    GoogleCalendarOAuthModule
  ],
})
export class AppModule {}
