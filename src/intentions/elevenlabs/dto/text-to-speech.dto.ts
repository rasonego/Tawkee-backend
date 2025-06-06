import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VoiceSettingsDto {
  @ApiProperty({
    description: 'Stability setting for the voice (0.0-1.0)',
    example: 0.5,
    minimum: 0,
    maximum: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  stability?: number;

  @ApiProperty({
    description: 'Similarity boost for the voice (0.0-1.0)',
    example: 0.8,
    minimum: 0,
    maximum: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  similarity_boost?: number;

  @ApiProperty({
    description: 'Style exaggeration for the voice (0.0-1.0)',
    example: 0.0,
    minimum: 0,
    maximum: 1,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  style?: number;

  @ApiProperty({
    description: 'Whether to use speaker boost',
    example: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  use_speaker_boost?: boolean;
}

export class TextToSpeechDto {
  @ApiProperty({
    description: 'Text to convert to speech',
    example: 'Hello, this is a test of the ElevenLabs text-to-speech API.',
    maxLength: 5000
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Model ID to use for generation',
    example: 'eleven_monolingual_v1',
    required: false
  })
  @IsOptional()
  @IsString()
  model_id?: string;

  @ApiProperty({
    description: 'Voice settings for generation',
    type: VoiceSettingsDto,
    required: false
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceSettingsDto)
  voice_settings?: VoiceSettingsDto;

  @ApiProperty({
    description: 'Output format for the audio',
    example: 'mp3_44100_128',
    required: false
  })
  @IsOptional()
  @IsString()
  output_format?: string;

  @ApiProperty({
    description: 'Optimize streaming latency (0-4)',
    example: 0,
    minimum: 0,
    maximum: 4,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  optimize_streaming_latency?: number;
}