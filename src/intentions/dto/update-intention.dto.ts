import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreprocessingType } from '@prisma/client';
import {
  IntentionFieldDto,
  IntentionHeaderDto,
  IntentionParamDto,
} from './intention.dto';

export class UpdateIntentionDto {
  @ApiProperty({
    description: 'Intention ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Intention description',
    example: 'Get customer information',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Preprocessing message type',
    enum: PreprocessingType,
    example: PreprocessingType.DISABLED,
  })
  @IsEnum(PreprocessingType)
  preprocessingMessage: PreprocessingType;

  @ApiProperty({
    description: 'Preprocessing text (when preprocessingMessage is MANUAL)',
    example: 'I need to get customer information',
    required: false,
  })
  @IsOptional()
  @IsString()
  preprocessingText?: string;

  @ApiProperty({
    description: 'Intention type',
    example: 'WEBHOOK',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'HTTP method',
    example: 'GET',
  })
  @IsString()
  @IsNotEmpty()
  httpMethod: string;

  @ApiProperty({
    description: 'Webhook URL',
    example: 'https://example.com/api/customers',
    required: false,
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiProperty({
    description: 'Request body template',
    example: '{"query": "{{customerName}}"}',
    required: false,
  })
  @IsOptional()
  @IsString()
  requestBody?: string;

  @ApiProperty({
    description: 'Whether to auto-generate parameters',
    example: true,
  })
  @IsBoolean()
  autoGenerateParams: boolean;

  @ApiProperty({
    description: 'Whether to auto-generate request body',
    example: true,
  })
  @IsBoolean()
  autoGenerateBody: boolean;

  @ApiProperty({
    description: 'Fields that the intention needs to collect',
    type: [IntentionFieldDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionFieldDto)
  fields: IntentionFieldDto[];

  @ApiProperty({
    description: 'HTTP headers for the webhook',
    type: [IntentionHeaderDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionHeaderDto)
  headers: IntentionHeaderDto[];

  @ApiProperty({
    description: 'Parameters for the webhook',
    type: [IntentionParamDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionParamDto)
  params: IntentionParamDto[];
}
