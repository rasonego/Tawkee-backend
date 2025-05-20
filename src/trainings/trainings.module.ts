import { Module } from '@nestjs/common';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AgentsModule],
  controllers: [TrainingsController],
  providers: [TrainingsService],
})
export class TrainingsModule {}
