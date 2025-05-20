import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { CommunicationType, AgentType } from '@prisma/client';

export class CreateAgentDto {
  @ApiProperty({
    description: 'Agent name',
    example: 'Support Assistant',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Agent behavior description',
    example:
      'Friendly and helpful support assistant that answers customer inquiries.',
    required: false,
  })
  @IsString()
  @IsOptional()
  behavior?: string;

  @ApiProperty({
    description: 'Agent avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiProperty({
    description: 'Agent communication type',
    enum: CommunicationType,
    example: CommunicationType.NORMAL,
    required: false,
  })
  @IsEnum(CommunicationType)
  @IsOptional()
  communicationType?: CommunicationType;

  @ApiProperty({
    description: 'Agent type',
    enum: AgentType,
    example: AgentType.SUPPORT,
    required: false,
  })
  @IsEnum(AgentType)
  @IsOptional()
  type?: AgentType;

  @ApiProperty({
    description: 'Agent job name',
    example: 'Customer Support',
    required: false,
  })
  @IsString()
  @IsOptional()
  jobName?: string;

  @ApiProperty({
    description: 'Agent job site',
    example: 'https://example.com',
    required: false,
  })
  @IsString()
  @IsOptional()
  jobSite?: string;

  @ApiProperty({
    description: 'Agent job description',
    example: 'Handles customer inquiries and provides technical support.',
    required: false,
  })
  @IsString()
  @IsOptional()
  jobDescription?: string;
}
