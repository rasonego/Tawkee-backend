import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ResolveInteractionDto {
  @ApiProperty({
    description: 'Optional resolution notes',
    example: 'Customer issue was resolved successfully',
    required: false,
  })
  @IsOptional()
  @IsString()
  resolution?: string;
}
