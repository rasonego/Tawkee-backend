import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { AIModel, ResponseDelayOptions } from '@prisma/client';

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
    description: 'Defines the time to wait before sending reminders',
    example: true,
  })
  @IsBoolean()
  reminderIntervalMinutes: number;
  
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
    description: 'Defines how long the agent should wait before sending a response, simulating a more human-like typing experience.',
    example: 5
  })
  @IsEnum(ResponseDelayOptions)
  responseDelaySeconds?: ResponseDelayOptions;

  @ApiProperty({
    description: 'If true, the agent will always respond using audio',
    example: true,
  })
  @IsBoolean()
  alwaysRespondWithAudio?: boolean;

  @ApiProperty({
    description:
      'If true, the agent will respond with audio when user sends audio',
    example: true,
  })
  @IsBoolean()
  respondAudioWithAudio?: boolean;

  @ApiProperty({
    description: 'Voice stability for ElevenLabs (range 0.0 to 1.0)',
    example: 0.75,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  stability?: number;

  @ApiProperty({
    description: 'Similarity boost for ElevenLabs (range 0.0 to 1.0)',
    example: 0.6,
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  similarityBoost?: number;
}
