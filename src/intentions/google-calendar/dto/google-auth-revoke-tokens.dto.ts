import { ApiProperty } from '@nestjs/swagger';

export class GoogleRevokeTokensDto {
  @ApiProperty({ description: 'True if tokens were successfully revoked' })
  success: boolean;
}
