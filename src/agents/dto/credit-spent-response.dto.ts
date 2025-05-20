import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsArray } from 'class-validator';
import { CreditSpentItemDto } from './credit-spent-item.dto';

export class CreditSpentResponseDto {
  @ApiProperty({
    description: 'Total number of credits spent',
    example: 123,
  })
  @IsNumber()
  total: number;

  @ApiProperty({
    description: 'List of credit spent items by date and model',
    type: [CreditSpentItemDto],
  })
  @IsArray()
  data: CreditSpentItemDto[];
}
