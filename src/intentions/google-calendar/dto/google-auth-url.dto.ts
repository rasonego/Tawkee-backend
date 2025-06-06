import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthUrlDto {
  @ApiProperty({ description: 'Generated Google OAuth URL' })
  authUrl: string;

  @ApiProperty({ description: 'State parameter for validation' })
  state: string;
}
