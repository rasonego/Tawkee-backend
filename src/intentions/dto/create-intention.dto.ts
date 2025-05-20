import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PreprocessingType } from '@prisma/client';
import {
  IntentionFieldDto,
  IntentionHeaderDto,
  IntentionParamDto,
} from './intention.dto';

export class CreateIntentionDto {
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
    default: 'WEBHOOK',
  })
  @IsString()
  @IsNotEmpty()
  type: string = 'WEBHOOK';

  @ApiProperty({
    description: 'HTTP method',
    example: 'GET',
    default: 'GET',
  })
  @IsString()
  @IsNotEmpty()
  httpMethod: string = 'GET';

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
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  autoGenerateParams?: boolean = true;

  @ApiProperty({
    description: 'Whether to auto-generate request body',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  autoGenerateBody?: boolean = true;

  @ApiProperty({
    description: 'Fields that the intention needs to collect',
    type: [IntentionFieldDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionFieldDto)
  @IsOptional()
  fields?: IntentionFieldDto[];

  @ApiProperty({
    description: 'HTTP headers for the webhook',
    type: [IntentionHeaderDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionHeaderDto)
  @IsOptional()
  headers?: IntentionHeaderDto[];

  @ApiProperty({
    description: 'Parameters for the webhook',
    type: [IntentionParamDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionParamDto)
  @IsOptional()
  params?: IntentionParamDto[];
}
