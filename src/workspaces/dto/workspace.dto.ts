import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class WorkspacePlanDto {
  @ApiProperty({ example: 'Pro', description: 'Name of the subscription plan' })
  @IsString()
  name: string;
}

class WorkspaceSubscriptionDto {
  @ApiProperty({ example: 'ACTIVE', description: 'Subscription status' })
  @IsString()
  status: string;

  @ApiProperty({ type: WorkspacePlanDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspacePlanDto)
  plan?: WorkspacePlanDto;
}

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

  @ApiProperty({
    description: 'Date the workspace was created',
    example: '2024-06-27T12:34:56.789Z',
  })
  @IsDateString()
  createdAt: string;

  @ApiProperty({
    description: 'Email of the user linked to the workspace',
    example: 'user@example.com',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  email: string | null;

  @ApiProperty({
    description: 'Whether the workspace is active (not deleted)',
    example: true,
  })
  @IsBoolean()
  isActive: boolean;

  @ApiProperty({
    description: 'Most recent subscription data',
    type: WorkspaceSubscriptionDto,
    nullable: true,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceSubscriptionDto)
  subscription: WorkspaceSubscriptionDto | null;
}

class MetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class PaginatedWorkspaceResponseDto {
  @ApiProperty({ type: [WorkspaceDto] })
  data: WorkspaceDto[];

  @ApiProperty({ type: MetaDto })
  meta: MetaDto;
}
