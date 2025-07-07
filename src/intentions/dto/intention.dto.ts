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
import { PreprocessingType, FieldType } from '@prisma/client';
import { IntentionPreconditionDto } from './intention-precondition.dto';

export class IntentionFieldDto {
  @ApiProperty({
    description: 'Field name',
    example: 'Customer Name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Field name in JSON',
    example: 'customerName',
  })
  @IsString()
  @IsNotEmpty()
  jsonName: string;

  @ApiProperty({
    description: 'Field description',
    example: 'The name of the customer',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'Field type',
    enum: FieldType,
    example: FieldType.TEXT,
  })
  @IsEnum(FieldType)
  type: FieldType;

  @ApiProperty({
    description: 'Whether the field is required',
    example: true,
  })
  @IsBoolean()
  required: boolean;
}

export class IntentionHeaderDto {
  @ApiProperty({
    description: 'Header name',
    example: 'Content-Type',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Header value',
    example: 'application/json',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class IntentionParamDto {
  @ApiProperty({
    description: 'Parameter name',
    example: 'apiKey',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Parameter value',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  value: string;
}

export class IntentionDto {
  @ApiProperty({
    description: 'Intention unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  id?: string;

  @ApiProperty({
    description: 'Tool name (unique identifier for OpenAI function calling)',
    example: 'schedule_meeting_google_calendar',
  })
  @IsString()
  @IsNotEmpty()
  toolName: string;

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
    description:
      'A hint of how the AI should answer when executing this intention',
    example:
      'Reply briefly and clearly that the conversation has been handed off to a human agent and that they should wait a moment.',
  })
  @IsString()
  @IsOptional()
  outputHint?: string;

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
  httpMethod?: string;

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
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionFieldDto)
  fields: IntentionFieldDto[];

  @ApiProperty({
    description: 'HTTP headers for the webhook',
    type: [IntentionHeaderDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionHeaderDto)
  headers?: IntentionHeaderDto[];

  @ApiProperty({
    description: 'Parameters for the webhook',
    type: [IntentionParamDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionParamDto)
  params?: IntentionParamDto[];

  @ApiProperty({
    description: 'Preconditions to check before executing the intention',
    type: [IntentionPreconditionDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionPreconditionDto)
  @IsOptional()
  preconditions?: IntentionPreconditionDto[];

  @ApiProperty({
    description: 'Parameters for the webhook',
    type: [IntentionParamDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionParamDto)
  queryParams?: IntentionParamDto[];

  localHandler?: (fields: Record<string, any>) => Promise<any>;
}
