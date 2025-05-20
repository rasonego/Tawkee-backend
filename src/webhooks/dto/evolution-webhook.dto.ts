import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsBoolean,
  IsObject,
  IsOptional,
  ValidateNested,
  IsNumber,
  IsISO8601,
} from 'class-validator';

// Nested DTOs for the message structure
export class MessageKey {
  @ApiProperty({
    description: 'The recipient phone number with domain',
    example: '553597731025@s.whatsapp.net',
  })
  @IsString()
  remoteJid: string;

  @ApiProperty({
    description: 'Whether the message was sent by the account owner',
    example: true,
  })
  @IsBoolean()
  fromMe: boolean;

  @ApiProperty({
    description: 'Unique message identifier',
    example: '0100A7D3C3A5BD5F97EB1E774399D8B3',
  })
  @IsString()
  id: string;
}

export class MessageContextInfo {
  @ApiProperty({
    description: 'Message secret',
    example: 'xT46+HciN92zmN518N4MGO2Xfub6niXHrwJHU+95/ws=',
  })
  @IsString()
  messageSecret: string;
}

export class MessageContent {
  @ApiProperty({
    description: 'Text content of the message',
    example: 'Mensagem de teste',
    required: false,
  })
  @IsString()
  @IsOptional()
  conversation?: string;

  @ApiProperty({ description: 'Message context information', required: false })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => MessageContextInfo)
  messageContextInfo?: MessageContextInfo;
}

export class MessageData {
  @ApiProperty({ description: 'Message key information' })
  @IsObject()
  @ValidateNested()
  @Type(() => MessageKey)
  key: MessageKey;

  @ApiProperty({
    description: 'Name of the message sender',
    example: 'Victor Baptista',
    required: false,
  })
  @IsString()
  @IsOptional()
  pushName?: string;

  @ApiProperty({ description: 'Message content' })
  @IsObject()
  @ValidateNested()
  @Type(() => MessageContent)
  message: MessageContent;

  @ApiProperty({ description: 'Type of message', example: 'conversation' })
  @IsString()
  messageType: string;

  @ApiProperty({ description: 'Timestamp of the message', example: 1746272800 })
  @IsNumber()
  messageTimestamp: number;

  @ApiProperty({
    description: 'Instance ID',
    example: 'd306001a-8793-47ec-be85-7f246983d1f5',
  })
  @IsString()
  instanceId: string;

  @ApiProperty({
    description: 'Source platform',
    example: 'android',
    required: false,
  })
  @IsString()
  @IsOptional()
  source?: string;
}

export class EvolutionWebhookDto {
  @ApiProperty({ description: 'Event type', example: 'messages.upsert' })
  @IsString()
  event: string;

  @ApiProperty({ description: 'Instance name', example: 'Teste' })
  @IsString()
  instance: string;

  @ApiProperty({ description: 'Message data' })
  @IsObject()
  @ValidateNested()
  @Type(() => MessageData)
  data: MessageData;

  @ApiProperty({
    description: 'Webhook destination URL',
    example: 'https://example.com/webhook',
    required: false,
  })
  @IsString()
  @IsOptional()
  destination?: string;

  @ApiProperty({
    description: 'Date and time when the webhook was triggered',
    example: '2025-05-03T08:46:40.638Z',
    required: false,
  })
  @IsISO8601()
  @IsOptional()
  date_time?: string;

  @ApiProperty({
    description: 'Sender phone number',
    example: '558396628630@s.whatsapp.net',
    required: false,
  })
  @IsString()
  @IsOptional()
  sender?: string;

  @ApiProperty({
    description: 'Evolution API server URL',
    example: 'http://localhost:8080',
    required: false,
  })
  @IsString()
  @IsOptional()
  server_url?: string;

  @ApiProperty({
    description: 'API key used for authentication',
    example: 'B8F693111D90-4571-863D-92429C4D1C69',
    required: false,
  })
  @IsString()
  @IsOptional()
  apikey?: string;
}
