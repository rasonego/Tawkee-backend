import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsInt, IsEnum } from 'class-validator';
import { SubscriptionStatus } from '@prisma/client';

export class WorkspaceDto {
  @ApiProperty({
    description: 'Workspace unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Workspace name',
    example: 'My Workspace',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class WorkspaceCreditsDto {
  @ApiProperty({
    description: 'Number of credits available',
    example: 1000,
  })
  @IsInt()
  credits: number;

  @ApiProperty({
    description: 'Subscription status',
    enum: SubscriptionStatus,
    example: 'ACTIVE',
  })
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;
}
