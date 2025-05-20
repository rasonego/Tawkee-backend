import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class InteractionMessageDto {
  @ApiProperty({
    description: 'Message unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174004',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Text content of the message',
    example: 'Hello, how can I help you today?',
    required: false,
  })
  @IsString()
  @IsOptional()
  text: string;

  @ApiProperty({
    description: 'Role of the sender (user, assistant, etc.)',
    example: 'assistant',
  })
  @IsString()
  role: string;

  @ApiProperty({
    description: 'Name of the user who sent the message',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  userName: string;

  @ApiProperty({
    description: 'ID of the user who sent the message',
    example: '123e4567-e89b-12d3-a456-426614174003',
    required: false,
  })
  @IsString()
  @IsOptional()
  userId: string;

  @ApiProperty({
    description: 'URL to the user profile picture',
    example: 'https://example.com/profile.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  userPicture: string;

  @ApiProperty({
    description: 'Timestamp of the message (unix timestamp)',
    example: 1699338716,
  })
  @IsNumber()
  time: number;

  @ApiProperty({
    description: 'Type of the message (text, image, audio, etc.)',
    example: 'text',
    required: false,
  })
  @IsString()
  @IsOptional()
  type: string;

  @ApiProperty({
    description: 'URL to an image attachment',
    example: 'https://example.com/image.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  imageUrl: string;

  @ApiProperty({
    description: 'URL to an audio attachment',
    example: 'https://example.com/audio.mp3',
    required: false,
  })
  @IsString()
  @IsOptional()
  audioUrl: string;

  @ApiProperty({
    description: 'URL to a document attachment',
    example: 'https://example.com/document.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  documentUrl: string;

  @ApiProperty({
    description: 'Filename of an attachment',
    example: 'document.pdf',
    required: false,
  })
  @IsString()
  @IsOptional()
  fileName: string;

  @ApiProperty({
    description: 'Media content (e.g., base64 encoded)',
    example: 'base64encodedcontent',
    required: false,
  })
  @IsString()
  @IsOptional()
  midiaContent: string;

  @ApiProperty({
    description: 'Width of an image or video attachment',
    example: 800,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  width: number;

  @ApiProperty({
    description: 'Height of an image or video attachment',
    example: 600,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  height: number;
}
