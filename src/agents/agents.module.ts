import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [AgentsController],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
