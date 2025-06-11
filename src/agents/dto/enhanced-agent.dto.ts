import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { CommunicationType, AgentType } from '@prisma/client';
import { Type } from 'class-transformer';
import { AgentSettingsDto } from '../../agent-settings/dto/agent-settings.dto';
import { AgentWebhooksDto } from '../../agent-webhooks/dto/agent-webhooks.dto';
import { IntentionDto } from 'src/intentions/dto/intention.dto';
import { PartialScheduleSettingsDto, ScheduleSettingsDto } from 'src/intentions/google-calendar/schedule-validation/dto/schedule-validation.dto';

class BasicAgentInfo {
  @ApiProperty({
    description: 'Agent unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Workspace ID this agent belongs to',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  @IsString()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({
    description: 'Agent name',
    example: 'Support Assistant',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Agent behavior description',
    example:
      'Friendly and helpful support assistant that answers customer inquiries.',
  })
  @IsString()
  @IsNotEmpty()
  behavior: string;

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
  })
  @IsEnum(CommunicationType)
  communicationType: CommunicationType;

  @ApiProperty({
    description: 'Agent type',
    enum: AgentType,
    example: AgentType.SUPPORT,
  })
  @IsEnum(AgentType)
  type: AgentType;

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

  @ApiProperty({
    description: 'Agent activation status',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Agent channels',
    example: [],
    type: 'array',
    required: false,
  })
  @IsOptional()
  channels?: any[];

  @ApiProperty({
    description: 'List of intentions defined for the agent',
    type: [IntentionDto],
  })
  @ValidateNested({ each: true })
  @Type(() => IntentionDto)
  intentions?: IntentionDto[];
}

export class EnhancedAgentDto {
  @ApiProperty({
    description: 'Agent basic information',
    type: BasicAgentInfo,
  })
  @ValidateNested()
  @Type(() => BasicAgentInfo)
  agent: BasicAgentInfo;

  @ApiProperty({
    description: 'Agent settings',
    type: AgentSettingsDto,
  })
  @ValidateNested()
  @Type(() => AgentSettingsDto)
  settings: AgentSettingsDto;

  @ApiProperty({
    description: 'Agent webhooks',
    type: AgentWebhooksDto,
  })
  @ValidateNested()
  @Type(() => AgentWebhooksDto)
  webhooks: AgentWebhooksDto;

  @ApiProperty({
    description: 'Agent Schedule Settings',
    type: PartialScheduleSettingsDto
  })
  scheduleSettings: PartialScheduleSettingsDto;
}
