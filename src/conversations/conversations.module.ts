import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AgentsModule } from '../agents/agents.module';
import { ChatsModule } from '../chats/chats.module';
import { AuthModule } from '../auth/auth.module';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { OpenAiModule } from '../openai/openai.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { GoogleCalendarOAuthModule } from 'src/intentions/google-calendar/google-calendar-oauth.module';

@Module({
  imports: [
    AuthModule,
    AgentsModule,
    ChatsModule,
    DeepseekModule,
    OpenAiModule,
    TrainingsModule,
    GoogleCalendarOAuthModule
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
