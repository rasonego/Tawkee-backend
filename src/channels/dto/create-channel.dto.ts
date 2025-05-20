import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ChannelType } from '@prisma/client';

export class CreateChannelDto {
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

  @ApiPropertyOptional({
    description:
      'Optional webhook token for verification (used for custom webhook security)',
    example: 'webhook-secret-token',
  })
  @IsString()
  @IsOptional()
  webhookToken?: string;
}
