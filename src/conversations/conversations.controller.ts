import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
  Delete,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ElevenLabsService } from 'src/elevenlabs/elevenlabs.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ConversationDto } from './dto/conversation.dto';
import { ConversationResponseDto } from './dto/conversation-response.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { getCommunicationGuide } from '../common/utils/communication-guides';
import { getGoalGuide } from '../common/utils/goal-guides';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ElevenLabsSettingsDto } from 'src/elevenlabs/dto/elevenlabs.dto';

class TextToAudioDto {
  @IsString()
  text: string;

  @IsString()
  voiceId: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsNumber()
  stability?: number;

  @IsOptional()
  @IsNumber()
  similarityBoost?: number;
}

class VoiceCloningDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  files: string[]; // This would typically be handled by file upload middleware
}

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly elevenLabsService: ElevenLabsService
  ) {}

  @Post('agent/:agentId/conversation')
  @ApiOperation({ summary: 'Start or continue a conversation with an agent' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the response via text, and may include an array of images and/or audios',
    type: ConversationResponseDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async converse(
    @Param('agentId') agentId: string,
    @Body() conversationDto: ConversationDto
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.converse(agentId, conversationDto);
  }

  @Post('agent/:agentId/add-message')
  @ApiOperation({ summary: 'Add a message to an existing conversation' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the response via text, and may include an array of images and/or audios',
    type: ConversationResponseDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async addMessage(
    @Param('agentId') agentId: string,
    @Body() addMessageDto: AddMessageDto
  ): Promise<ConversationResponseDto> {
    return this.conversationsService.addMessage(agentId, addMessageDto);
  }

  @Get('communication-guide')
  @ApiOperation({
    summary: 'Get a communication guide for a specific communication type',
  })
  @ApiQuery({
    name: 'type',
    description: 'The communication type (FORMAL, NORMAL, RELAXED)',
    required: true,
    enum: ['FORMAL', 'NORMAL', 'RELAXED'],
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the communication guide for the specified type',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'NORMAL' },
        guide: {
          type: 'string',
          example: 'When using NORMAL communication style...',
        },
      },
    },
  })
  async getCommunicationGuide(
    @Query('type') type: string
  ): Promise<{ type: string; guide: string }> {
    return {
      type,
      guide: getCommunicationGuide(type),
    };
  }

  @Get('goal-guide')
  @ApiOperation({ summary: 'Get a goal guide for a specific agent type' })
  @ApiQuery({
    name: 'type',
    description: 'The agent type (SUPPORT, SALE, PERSONAL)',
    required: true,
    enum: ['SUPPORT', 'SALE', 'PERSONAL'],
  })
  @ApiResponse({
    status: 200,
    description: 'Returns the goal guide for the specified agent type',
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', example: 'SUPPORT' },
        guide: {
          type: 'string',
          example:
            'When your goal is set to "SUPPORT", your primary objective is to help users solve problems...',
        },
      },
    },
  })
  async getGoalGuide(
    @Query('type') type: string
  ): Promise<{ type: string; guide: string }> {
    return {
      type,
      guide: getGoalGuide(type),
    };
  }

  @Post('elevenlabs-activate/:agentId')
  @ApiOperation({ summary: 'Activate ElevenLabs integration for this agent' })
  @ApiResponse({ status: 200, description: 'ElevenLabs integration activated successfully' })
  async activateElevenLabs(
    @Param('agentId') agentId: string,
    @Body() body: { apiKey: string }
  ): Promise<{ message: string }> {
    await this.elevenLabsService.activateIntegration({ apiKey: body.apiKey, agentId });
    return { message: 'ElevenLabs integration activated successfully' };
  }

  @Post('elevenlabs-deactivate/:agentId')
  @ApiOperation({ summary: 'Deactivate ElevenLabs integration for this agent' })
  @ApiResponse({ status: 200, description: 'ElevenLabs integration deactivated successfully' })
  async deactivateElevenLabs(
    @Param('agentId') agentId: string
  ): Promise<{ message: string }> {
    await this.elevenLabsService.deactivateIntegration(agentId);
    return { message: 'ElevenLabs integration deactivated successfully' };
  }

  @Get('elevenlabs-data/:agentId')
  @ApiOperation({ summary: 'Fetch ElevenLabs voices and user data for an agent' })
  @ApiResponse({ status: 200, description: 'Voices retrieved successfully' })
  async getElevenLabsData(
    @Param('agentId') agentId: string,
  ): Promise<any> {
    return this.elevenLabsService.getData(agentId);
  }

  @Post('elevenlabs-update-settings/:agentId')
  @ApiOperation({ summary: 'Update ElevenLabs settings for this agent' })
  @ApiResponse({ status: 200, description: 'Voice selection updated successfully' })
  async updateElevenLabsSettings(
    @Param('agentId') agentId: string,
    @Body() body: Partial<ElevenLabsSettingsDto>
  ): Promise<{ message: string }> {

    await this.elevenLabsService.updateData(agentId, body);

    return { message: `Agent '${agentId} ElevenLabs settings updated!'` };
  }
}
