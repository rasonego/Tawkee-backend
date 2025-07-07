import { Module } from '@nestjs/common';
import { DeepseekService } from './deepseek.service';
import { ConfigModule } from '@nestjs/config';
import { CreditModule } from 'src/credits/credit.module';

@Module({
  imports: [ConfigModule, CreditModule],
  providers: [DeepseekService],
  exports: [DeepseekService],
})
export class DeepseekModule {}
