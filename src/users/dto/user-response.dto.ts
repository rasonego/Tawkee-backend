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

  @ApiProperty({ description: 'User name', example: 'John Doe' })
  name: string;

  @ApiProperty({ description: 'Name of Workspace', example: 'John Doe Workspace' })
  workspaceName: string;

  @ApiProperty({
    description: 'Workspace ID',
    example: 'w1x2y3z4-a5b6-c7d8-e9f0-g1h2i3j4k5l6',
  })
  workspaceId: string;

  @ApiProperty({
    description: 'Workspace Status',
    example: true,
  })
  workspaceIsActive: boolean;

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
    description: 'Authentication provider (google, facebook, or password)',
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

  @ApiProperty({
    description: 'Role associated with the user',
    required: true,
    example: {
      name: 'CLIENT',
      description: 'Client with limited permissions to their own workspace',
    },
  })
  role: {
    name: string;
    description?: string;
  };

  @ApiProperty({
    description:
      'Role permissions for accessing various resources in the workspace',
    required: false,
    example: [
      { action: 'VIEW_PROFILE', resource: 'USER' },
      { action: 'EDIT_PROFILE', resource: 'USER' },
    ],
  })
  rolePermissions: { action: string; resource: string }[];

  @ApiProperty({
    description:
      'User permissions for accessing various resources in the workspace',
    required: false,
    example: [
      { action: 'VIEW_PROFILE', resource: 'USER', allowed: true },
      { action: 'EDIT_PROFILE', resource: 'USER', allowed: false },
    ],
  })
  userPermissions: { action: string; resource: string; allowed: boolean }[];

  @ApiProperty({
    description: 'Smart recharge settings for extra credits',
    required: false,
    example: {
      threshold: 1000,
      rechargeAmount: 1000,
      active: false,
    },
  })
  smartRecharge?: {
    threshold: number;
    rechargeAmount: number;
    active: boolean;
  };

  @ApiProperty({
    description:
      'Current subscription data if user has active or trial subscription',
    required: false,
    example: {
      currentPeriodEnd: '2025-06-20T00:00:00.000Z',
      trialEnd: '2025-06-25T00:00:00.000Z',
      customStripePriceId: null,
      featureOverrides: ['custom-support'],
      creditsLimitOverrides: 3000,
      agentLimitOverrides: 15,
      trainingTextLimitOverrides: 2000,
      trainingWebsiteLimitOverrides: 10,
      trainingVideoLimitOverrides: 5,
      trainingDocumentLimitOverrides: 20,
    },
  })
  subscription?: {
    currentPeriodEnd: string;
    trialEnd?: string;
    featureOverrides?: string[] | null;
    creditsLimitOverrides?: number | null;
    agentLimitOverrides?: number | null;
    trainingTextLimitOverrides?: number | null;
    trainingWebsiteLimitOverrides?: number | null;
    trainingVideoLimitOverrides?: number | null;
    trainingDocumentLimitOverrides?: number | null;
  };

  @ApiProperty({
    description: 'Plan metadata associated with current subscription',
    required: false,
    example: {
      name: 'Standard Plan',
      description: 'Access to core features and WhatsApp channels.',
      features: ['WhatsApp integration', 'Priority Support'],
      creditsLimit: 2000,
      agentLimit: 10,
      trainingTextLimit: 1500,
      trainingWebsiteLimit: 5,
      trainingVideoLimit: 2,
      trainingDocumentLimit: 5,
      isEnterprise: false,
      trialDays: 14,
    },
  })
  plan?: {
    name: string;
    description: string;
    features?: string[];
    creditsLimit: number;
    agentLimit: number;
    trainingTextLimit: number;
    trainingWebsiteLimit: number;
    trainingVideoLimit: number;
    trainingDocumentLimit: number;
    isEnterprise: boolean;
    trialDays: number;
  };

  @ApiProperty({
    description: 'Stripe price details for this plan',
    required: false,
    example: {
      id: 'price_abc123',
      amount: 19900,
      currency: 'usd',
      interval: 'month',
      intervalCount: 1,
    },
  })
  stripePriceDetails?: {
    id: string;
    amount: number;
    currency: string;
    interval: string;
    intervalCount: number;
  };
}
