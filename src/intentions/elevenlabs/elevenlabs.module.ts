import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ElevenLabsService } from './elevenlabs.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule
  ],
  providers: [ElevenLabsService],
  exports: [ElevenLabsService],
})
export class ElevenLabsModule {}