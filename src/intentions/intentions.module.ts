import { Module } from '@nestjs/common';
import { IntentionsController } from './intentions.controller';
import { IntentionsService } from './intentions.service';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';
import { ElevenLabsModule } from './elevenlabs/elevenlabs.module';

@Module({
  imports: [
    AuthModule,
    AgentsModule,
    ElevenLabsModule
  ],
  controllers: [IntentionsController],
  providers: [IntentionsService],
})
export class IntentionsModule {}
