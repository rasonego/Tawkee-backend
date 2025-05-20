import { Module } from '@nestjs/common';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { AuthModule } from '../auth/auth.module';
import { EvolutionApiModule } from '../evolution-api/evolution-api.module';

@Module({
  imports: [AuthModule, EvolutionApiModule],
  controllers: [InteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
