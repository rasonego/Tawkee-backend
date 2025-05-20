import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum InteractionStatus {
  RUNNING = 'RUNNING',
  WAITING = 'WAITING',
  RESOLVED = 'RESOLVED',
}

export class InteractionDto {
  @ApiProperty({
    description: 'Interaction unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: 'Agent ID that handled this interaction',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsString()
  agentId: string;

  @ApiProperty({
    description: 'Agent name',
    example: 'Support Assistant',
  })
  @IsString()
  agentName: string;

  @ApiProperty({
    description: 'Agent avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  agentAvatar: string;

  @ApiProperty({
    description: 'Chat ID (contextId)',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  @IsString()
  chatId: string;

  @ApiProperty({
    description: 'Chat name',
    example: 'Customer Support Session',
    required: false,
  })
  @IsString()
  @IsOptional()
  chatName: string;

  @ApiProperty({
    description: 'Interaction status',
    enum: InteractionStatus,
    example: InteractionStatus.RUNNING,
  })
  @IsEnum(InteractionStatus)
  status: InteractionStatus;

  @ApiProperty({
    description: 'Start time of the interaction',
    example: '2023-11-07T05:31:56Z',
  })
  startAt: Date;

  @ApiProperty({
    description: 'Time when the interaction was transferred to a human',
    example: '2023-11-07T05:31:56Z',
    required: false,
  })
  @IsOptional()
  transferAt: Date;

  @ApiProperty({
    description: 'Time when the interaction was resolved',
    example: '2023-11-07T05:31:56Z',
    required: false,
  })
  @IsOptional()
  resolvedAt: Date;

  @ApiProperty({
    description: 'ID of the user who participated in the interaction',
    example: '123e4567-e89b-12d3-a456-426614174003',
    required: false,
  })
  @IsString()
  @IsOptional()
  userId: string;
}
