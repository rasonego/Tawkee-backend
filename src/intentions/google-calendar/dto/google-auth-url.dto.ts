import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthUrlDto {
  @ApiProperty({ description: 'User ID to generate auth URL for' })
  @IsString()
  @IsUUID()
  userId: string;
}