import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { AgentsModule } from '../agents/agents.module';
import { ChatsModule } from '../chats/chats.module';
import { AuthModule } from '../auth/auth.module';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [AuthModule, AgentsModule, ChatsModule, OpenAiModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
