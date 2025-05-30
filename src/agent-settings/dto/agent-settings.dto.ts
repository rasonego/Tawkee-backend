import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { AIModel, GroupingTime } from '@prisma/client';

export class AgentSettingsDto {
  @ApiProperty({
    description: 'Preferred AI model',
    enum: AIModel,
    example: AIModel.GPT_4_1,
  })
  @IsEnum(AIModel)
  preferredModel: AIModel;

  @ApiProperty({
    description: 'Agent timezone',
    example: '(GMT+00:00) London',
  })
  @IsString()
  timezone: string;

  @ApiProperty({
    description: 'Defines if the agent can transfer to human during chat',
    example: true,
  })
  @IsBoolean()
  enabledHumanTransfer: boolean;

  @ApiProperty({
    description: 'Defines if the agent can schedule reminders',
    example: true,
  })
  @IsBoolean()
  enabledReminder: boolean;

  @ApiProperty({
    description:
      'Defines if the message will be split in various, in case it is huge',
    example: true,
  })
  @IsBoolean()
  splitMessages: boolean;

  @ApiProperty({
    description: 'Defines if the agent can use emoji on the messages',
    example: true,
  })
  @IsBoolean()
  enabledEmoji: boolean;

  @ApiProperty({
    description:
      'Defines if the agent can talk about other subjects rather than the company or product subject',
    example: true,
  })
  @IsBoolean()
  limitSubjects: boolean;

  @ApiProperty({
    description: 'Message grouping time setting',
    enum: GroupingTime,
    example: GroupingTime.NO_GROUP,
    required: false
  })
  @IsEnum(GroupingTime)
  @IsOptional()
  messageGroupingTime?: GroupingTime;
}
