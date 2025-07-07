import { forwardRef, Module } from '@nestjs/common';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { AuthModule } from '../auth/auth.module';
import { WahaApiModule } from '../waha-api/waha-api.module';
import { WebsocketModule } from 'src/websocket/websocket.module';
import { ConversationsModule } from 'src/conversations/conversations.module';

@Module({
  imports: [
    AuthModule,
    WahaApiModule,
    WebsocketModule,
    forwardRef(() => ConversationsModule), // 👈 wrap with forwardRef
  ],
  controllers: [InteractionsController],
  providers: [InteractionsService],

  exports: [InteractionsService],
})
export class InteractionsModule {}
