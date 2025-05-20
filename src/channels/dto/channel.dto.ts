import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { ChannelType } from '@prisma/client';

export class ChannelDto {
  @ApiProperty({
    description: 'Channel unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Channel name',
    example: 'WhatsApp Business',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Channel type',
    enum: ChannelType,
    example: 'WHATSAPP',
  })
  @IsEnum(ChannelType)
  type: ChannelType;

  @ApiProperty({
    description: 'Whether the channel is connected',
    example: true,
  })
  @IsBoolean()
  connected: boolean;

  @ApiProperty({
    description: 'Channel configuration',
    example: {
      instanceId: '123456',
      instanceName: 'my-instance',
      webhookToken: 'abc123',
      webhookUrl: 'https://example.com/webhook',
    },
  })
  @IsObject()
  config: Record<string, any>;
}
