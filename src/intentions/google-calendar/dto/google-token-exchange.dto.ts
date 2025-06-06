import { ApiProperty } from '@nestjs/swagger';

export class GoogleTokenExchangeDto {
  @ApiProperty({ description: 'Access token from Google' })
  access_token: string;

  @ApiProperty({ description: 'Refresh token from Google', required: false })
  refresh_token?: string;

  @ApiProperty({ description: 'Expiration timestamp in ms' })
  expires_at: number;

  @ApiProperty({ description: 'Granted scopes' })
  scope: string;

  @ApiProperty({ description: 'Token type (e.g., Bearer)' })
  token_type: string;
}
