import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CreditSpentItemDto {
  @ApiProperty({
    description: 'Number of credits spent',
    example: 123,
  })
  @IsNumber()
  credits: number;

  @ApiProperty({
    description: 'Year when credits were spent',
    example: 2023,
  })
  @IsNumber()
  year: number;

  @ApiProperty({
    description: 'Month when credits were spent',
    example: 7,
  })
  @IsNumber()
  month: number;

  @ApiProperty({
    description: 'Day when credits were spent',
    example: 15,
  })
  @IsNumber()
  day: number;

  @ApiProperty({
    description: 'AI model used',
    example: 'GPT_4',
  })
  @IsString()
  model: string;
}
