import { Module } from '@nestjs/common';
import { AgentWebhooksController } from './agent-webhooks.controller';
import { AgentWebhooksService } from './agent-webhooks.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [AgentWebhooksController],
  providers: [AgentWebhooksService],
})
export class AgentWebhooksModule {}
