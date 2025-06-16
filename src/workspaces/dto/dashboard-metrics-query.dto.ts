import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class DashboardMetricsQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for the dashboard metrics (YYYY-MM-DD)',
    example: '2025-06-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for the dashboard metrics (YYYY-MM-DD)',
    example: '2025-06-14',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
