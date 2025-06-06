import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

export class IntentionPreconditionHeaderDto {
  @ApiProperty({ description: 'Header name', example: 'Authorization' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Header value', example: 'Bearer {{token}}' })
  @IsString()
  value: string;
}

export class IntentionPreconditionDto {
  @ApiProperty({ description: 'Precondition name', example: 'Check Availability' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'HTTP method', example: 'POST' })
  @IsString()
  httpMethod: string;

  @ApiProperty({ description: 'Endpoint URL', example: 'https://www.googleapis.com/calendar/v3/freeBusy' })
  @IsString()
  url: string;

  @ApiProperty({
    description: 'Request body template with field placeholders',
    example: '{"timeMin": "{{startDateTime}}", "timeMax": "{{endDateTime}}"}',
    required: false,
  })
  @IsOptional()
  @IsString()
  requestBody?: string;

  @ApiProperty({
    description: 'JS expression that returns true when the check fails (e.g., response.data.busy.length > 0)',
    example: 'response.data.busy.length > 0',
  })
  @IsString()
  failureCondition: string;

  @ApiProperty({
    description: 'Message to show when failure condition is met',
    example: 'The selected time slot is already booked.',
  })
  @IsString()
  failureMessage: string;

  @ApiProperty({
    description: 'Headers to include in the precondition request',
    type: [IntentionPreconditionHeaderDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntentionPreconditionHeaderDto)
  @IsOptional()
  headers?: IntentionPreconditionHeaderDto[];
}
