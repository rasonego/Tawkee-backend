import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
