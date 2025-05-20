import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class WarnInteractionDto {
  @ApiProperty({
    description: 'Custom warning message to send to the user',
    example: 'This conversation will close in 5 minutes due to inactivity.',
    required: false,
  })
  @IsOptional()
  @IsString()
  warningMessage?: string;
}
