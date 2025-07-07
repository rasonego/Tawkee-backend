import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';
import { WahaApiModule } from '../waha-api/waha-api.module';
import { ConfigModule } from '@nestjs/config';
import { WebsocketModule } from 'src/websocket/websocket.module';

@Module({
  imports: [
    AuthModule,
    AgentsModule,
    WahaApiModule,
    ConfigModule,
    WebsocketModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
