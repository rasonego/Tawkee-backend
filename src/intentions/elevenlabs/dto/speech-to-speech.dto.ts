import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, ValidateNested } from "class-validator";
import { VoiceSettingsDto } from "./text-to-speech.dto";
import { Type } from "class-transformer";

export class SpeechToSpeechDto {
  @ApiProperty({
    description: 'Model ID to use for speech conversion',
    example: 'eleven_english_sts_v2',
    required: false
  })
  @IsOptional()
  @IsString()
  model_id?: string;

  @ApiProperty({
    description: 'Voice settings for conversion',
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
}