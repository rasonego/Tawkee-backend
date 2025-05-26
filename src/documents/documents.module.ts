import { Module } from '@nestjs/common';
import { OpenAiModule } from 'src/openai/openai.module';
import { DocumentsService } from './documents.service';

@Module({
  imports: [OpenAiModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
