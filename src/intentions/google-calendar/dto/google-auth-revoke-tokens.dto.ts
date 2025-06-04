import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleRevokeTokensDto {
  @ApiProperty({ description: 'User ID to revoke tokens for' })
  @IsString()
  @IsUUID()
  userId: string;
}