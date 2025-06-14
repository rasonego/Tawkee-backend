import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AgentsModule } from '../agents/agents.module';
import { ChatsModule } from '../chats/chats.module';
import { AuthModule } from '../auth/auth.module';
import { DeepseekModule } from '../deepseek/deepseek.module';
import { OpenAiModule } from '../openai/openai.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { GoogleCalendarOAuthModule } from '../intentions/google-calendar/google-calendar-oauth.module';
import { ScheduleValidationModule } from '../intentions/google-calendar/schedule-validation/schedule-validation.module';
import { ElevenLabsService } from 'src/elevenlabs/elevenlabs.service';

@Module({
  imports: [
    AuthModule,
    AgentsModule,
    ChatsModule,
    DeepseekModule,
    OpenAiModule,
    TrainingsModule,
    GoogleCalendarOAuthModule,
    ScheduleValidationModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ElevenLabsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
