import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthStatusDto {
  @ApiProperty({ description: 'User ID to check auth status for' })
  @IsString()
  @IsUUID()
  userId: string;
}