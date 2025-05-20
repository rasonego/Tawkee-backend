import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
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

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

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
}
