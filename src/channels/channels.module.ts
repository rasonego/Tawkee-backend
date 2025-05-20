import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';
import { EvolutionApiModule } from '../evolution-api/evolution-api.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [AuthModule, AgentsModule, EvolutionApiModule, ConfigModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
