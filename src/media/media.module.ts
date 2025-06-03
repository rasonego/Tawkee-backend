import { Module } from '@nestjs/common';
import { OpenAiModule } from 'src/openai/openai.module';
import { MediaService } from './media.service';

@Module({
  imports: [OpenAiModule],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
