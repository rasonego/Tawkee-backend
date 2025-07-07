import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { ConfigModule } from '@nestjs/config';
import { CreditModule } from 'src/credits/credit.module';

@Module({
  imports: [ConfigModule, CreditModule],
  providers: [OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
