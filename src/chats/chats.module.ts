import { Module } from '@nestjs/common';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WahaApiModule } from '../waha-api/waha-api.module';
import { WebsocketModule } from 'src/websocket/websocket.module';
import { InteractionsModule } from 'src/interactions/interactions.module';

@Module({
  imports: [AuthModule, PrismaModule, WahaApiModule, WebsocketModule, InteractionsModule],
  controllers: [ChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
