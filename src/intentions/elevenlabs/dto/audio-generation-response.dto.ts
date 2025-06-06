import { ApiProperty } from "@nestjs/swagger";

export class AudioGenerationResponseDto {
  @ApiProperty({
    description: 'URL to the generated audio file',
    example: 'https://api.elevenlabs.io/v1/history/abc123/audio'
  })
  audioUrl?: string;

  @ApiProperty({
    description: 'Base64 encoded audio data',
    example: 'UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhCSiK2O/BdiMFl2+z6dTpX...'
  })
  audioData?: string;

  @ApiProperty({
    description: 'Duration of the audio in seconds',
    example: 5.2
  })
  duration?: number;

  @ApiProperty({
    description: 'Size of the audio file in bytes',
    example: 125440
  })
  size?: number;

  @ApiProperty({
    description: 'Character count used for generation',
    example: 42
  })
  character_count?: number;

  @ApiProperty({
    description: 'Request ID for tracking',
    example: 'req_abc123xyz'
  })
  request_id?: string;
}