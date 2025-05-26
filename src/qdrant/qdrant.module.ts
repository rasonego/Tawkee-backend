import { Module } from '@nestjs/common';
import { OpenAiModule } from '../openai/openai.module';
import { QdrantService } from './qdrant.service';

@Module({
  imports: [OpenAiModule],
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
