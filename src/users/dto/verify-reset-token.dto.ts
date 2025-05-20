import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyResetTokenDto {
  @ApiProperty({
    description: 'Reset token to verify',
    example: '7a23c9e0fb2bf5e03d7af9bf7e42215eb7ab3ab0f86a174a42f59fbeee45d2a9',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;
}
