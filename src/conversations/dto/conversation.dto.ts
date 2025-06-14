import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsBoolean,
} from 'class-validator';

export class ConversationDto {
  @ApiProperty({
    description: 'External ID to identify the client',
    example: '12345',
  })
  @IsString()
  @IsNotEmpty()
  contextId: string;

  @ApiProperty({
    description: 'Text for the agent to respond to',
    example: 'What is your name?',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'Callback URL for asynchronous response',
    example: 'https://webhook.site/12345',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  callbackUrl?: string;

  @ApiProperty({
    description: 'Client name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  chatName?: string;

  @ApiProperty({
    description: 'Client picture URL',
    example: 'https://example.com/profile.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  chatPicture?: string;

  @ApiProperty({
    description: 'Client WhatsApp phone number',
    example: '5511999999999',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Indicates whether agent response will be audio or text',
    required: true,
  })
  @IsBoolean()
  respondViaAudio: boolean;
}
