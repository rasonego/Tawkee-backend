import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class ConversationResponseDto {
  @ApiProperty({
    description: 'Response message from the agent',
    example: 'Hello! How can I help you today?',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Array of image URLs that may be included in the response',
    example: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({
    description: 'Array of audio URLs that may be included in the response',
    example: [
      'https://example.com/audio1.mp3',
      'https://example.com/audio2.mp3',
    ],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  audios?: string[];

  @ApiProperty({
    description: 'Communication guide used for generating the response',
    required: false,
    example:
      'When using NORMAL communication style: Use everyday language that is clear and accessible...',
  })
  @IsString()
  @IsOptional()
  communicationGuide?: string;

  @ApiProperty({
    description: 'Goal guide based on agent type (SUPPORT, SALE, PERSONAL)',
    required: false,
    example:
      'When your goal is set to "SUPPORT", your primary objective is to help users solve problems...',
  })
  @IsString()
  @IsOptional()
  goalGuide?: string;
}
