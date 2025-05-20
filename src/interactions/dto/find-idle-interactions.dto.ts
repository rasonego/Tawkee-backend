import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FindIdleInteractionsDto {
  @ApiProperty({
    description: 'Minimum idle time in minutes for RUNNING interactions',
    example: 30,
    default: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  runningIdleMinutes?: number = 30;

  @ApiProperty({
    description: 'Minimum idle time in minutes for WAITING interactions',
    example: 5,
    default: 5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  waitingIdleMinutes?: number = 5;
}
