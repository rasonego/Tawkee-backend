import { Module } from '@nestjs/common';
import { IntentionsController } from './intentions.controller';
import { IntentionsService } from './intentions.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [IntentionsController],
  providers: [IntentionsService],
  exports: [IntentionsService],
})
export class IntentionsModule {}
