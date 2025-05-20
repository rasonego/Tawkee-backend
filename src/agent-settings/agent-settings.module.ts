import { Module } from '@nestjs/common';
import { AgentSettingsController } from './agent-settings.controller';
import { AgentSettingsService } from './agent-settings.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [AgentSettingsController],
  providers: [AgentSettingsService],
  exports: [AgentSettingsService],
})
export class AgentSettingsModule {}
