import { Module } from '@nestjs/common';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [AuthModule, AgentsModule, QdrantModule, MediaModule],
  controllers: [TrainingsController],
  providers: [TrainingsService],
  exports: [TrainingsService],
})
export class TrainingsModule {}
