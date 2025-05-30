import { Module } from '@nestjs/common';
import { DeepseekService } from './deepseek.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [DeepseekService],
  exports: [DeepseekService],
})
export class DeepseekModule {}
