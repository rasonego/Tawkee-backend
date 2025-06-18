import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
  })
  id: string;

  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Workspace ID',
    example: 'w1x2y3z4-a5b6-c7d8-e9f0-g1h2i3j4k5l6',
  })
  workspaceId: string;

  @ApiProperty({
    description: 'Workspace credits',
    example: '1250',
  })
  workspaceCredits: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  lastName?: string;

  @ApiProperty({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  avatar?: string;

  @ApiProperty({
    description:
      'Authentication provider (google, facebook, or null for direct)',
    example: 'google',
    required: false,
  })
  provider?: string;

  @ApiProperty({
    description: 'Email verification status',
    example: true,
    default: false,
  })
  emailVerified?: boolean;
}
