import { ApiProperty } from '@nestjs/swagger';

export class GoogleAuthStatusDto {
  @ApiProperty({ description: 'User is authenticated' })
  isAuthenticated: boolean;

  @ApiProperty({ description: 'Access token needs refresh', required: false })
  needsRefresh?: boolean;

  @ApiProperty({ description: 'Expiration timestamp in ms', required: false })
  expiresAt?: number;

  @ApiProperty({ description: 'List of granted scopes', type: [String], required: false })
  scopes?: string[];
}
