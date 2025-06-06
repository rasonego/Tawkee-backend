import { ApiProperty } from "@nestjs/swagger";
import { VoiceSettingsDto } from "./text-to-speech.dto";

export class ElevenLabsVoiceDto {
  @ApiProperty({
    description: 'Unique voice identifier',
    example: 'pNInz6obpgDQGcFmaJgB'
  })
  voice_id: string;

  @ApiProperty({
    description: 'Voice name',
    example: 'Adam'
  })
  name: string;

  @ApiProperty({
    description: 'Voice category',
    example: 'premade'
  })
  category: string;

  @ApiProperty({
    description: 'Voice description',
    example: 'Middle aged American male'
  })
  description?: string;

  @ApiProperty({
    description: 'Preview URL for the voice',
    example: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/preview.mp3'
  })
  preview_url?: string;

  @ApiProperty({
    description: 'Available for use',
    example: true
  })
  available_for_tiers?: string[];

  @ApiProperty({
    description: 'Voice settings',
    type: VoiceSettingsDto
  })
  settings?: VoiceSettingsDto;

  @ApiProperty({
    description: 'Voice labels',
    example: ['american', 'male', 'middle aged']
  })
  labels?: string[];

  @ApiProperty({
    description: 'Voice samples',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        sample_id: { type: 'string' },
        file_name: { type: 'string' },
        mime_type: { type: 'string' },
        size_bytes: { type: 'number' },
        hash: { type: 'string' }
      }
    }
  })
  samples?: any[];
}
