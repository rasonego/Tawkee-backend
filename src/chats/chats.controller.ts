import {
  Controller,
  Get,
  Delete,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { ChatDto } from './dto/chat.dto';
import { MessageDto } from './dto/message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { PaginatedChatsResponseDto } from './dto/paginated-chats-response.dto';
import { PaginatedMessagesResponseDto } from './dto/paginated-messages-response.dto';

@ApiTags('Chats')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get('workspace/:workspaceId/chats')
  @ApiOperation({ summary: 'List chats for a workspace' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a list of chats',
    type: PaginatedChatsResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Workspace not found',
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiQuery({
    name: 'agentId',
    required: false,
    description: 'Filter by agent ID',
    type: String,
  })
  @ApiPaginationQueries()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() paginationDto: PaginationDto,
    @Query('agentId') agentId?: string
  ): Promise<PaginatedResult<ChatDto>> {
    return this.chatsService.findChatsByWorkspace(
      workspaceId,
      paginationDto,
      agentId
    );
  }

  // Endpoint to mark chat as finished
  @Put('chats/:chatId/finish/:userId')
  @ApiOperation({ summary: 'Mark a chat as finished' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chat marked as finished successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async markAsFinished(
    @Param('chatId') chatId: string,
    @Param('userId') userId: string
  ): Promise<{ success: boolean }> {
    // Assuming the service method handles the logic and potential errors (like not found)
    await this.chatsService.finishChat(chatId, userId);
    return { success: true }; // Return success if no error is thrown by the service
  }

  // Endpoint to mark chat as unfinished
  @Put('chats/:chatId/unfinish/:userId')
  @ApiOperation({ summary: 'Mark a chat as unfinished' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chat marked as unfinished successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async markAsUnfinished(
    @Param('chatId') chatId: string,
    @Param('userId') userId: string
  ): Promise<{ success: boolean }> {
    // Assuming the service method handles the logic and potential errors (like not found)
    await this.chatsService.unfinishChat(chatId, userId);
    return { success: true }; // Return success if no error is thrown by the service
  }

  // Endpoint to mark chat as read
  @Put('chats/:chatId/read')
  @ApiOperation({ summary: 'Mark a chat as read' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chat marked as read successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  async markAsRead(
    @Param('chatId') chatId: string
  ): Promise<{ success: boolean }> {
    // Assuming the service method handles the logic and potential errors (like not found)
    await this.chatsService.readChat(chatId);
    return { success: true }; // Return success if no error is thrown by the service
  }

  @Delete('chats/:chatId')
  @ApiOperation({ summary: 'Delete a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chat deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  async remove(@Param('chatId') chatId: string): Promise<{ success: boolean }> {
    return this.chatsService.deleteChat(chatId);
  }

  @Get('chats/:chatId/messages')
  @ApiOperation({ summary: 'List messages for a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a list of messages',
    type: PaginatedMessagesResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiPaginationQueries()
  async getMessages(
    @Param('chatId') chatId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedResult<MessageDto>> {
    return this.chatsService.findMessagesByChatId(chatId, paginationDto);
  }

  @Delete('chats/:chatId/messages')
  @ApiOperation({ summary: 'Delete all messages from a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Messages deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  async deleteMessages(
    @Param('chatId') chatId: string
  ): Promise<{ success: boolean }> {
    return this.chatsService.deleteMessages(chatId);
  }

  @Put('chats/:chatId/start-human/:userId')
  @ApiOperation({ summary: 'Start human attendance for a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Human attendance started successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async startHumanAttendance(
    @Param('chatId') chatId: string,
    @Param('userId') userId: string
  ): Promise<{ success: boolean }> {
    return this.chatsService.startHumanAttendance(chatId, userId);
  }

  @Put('chats/:chatId/stop-human/:userId')
  @ApiOperation({ summary: 'Stop human attendance for a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Human attendance stopped successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  async stopHumanAttendance(
    @Param('chatId') chatId: string,
    @Param('userId') userId: string
  ): Promise<{ success: boolean }> {
    return this.chatsService.stopHumanAttendance(chatId, userId);
  }

  @Post('chats/:chatId/send-message')
  @ApiOperation({ summary: 'Send a message in a chat' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Chat not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'chatId', description: 'Chat ID' })
  async sendMessage(
    @Param('chatId') chatId: string,
    @Body() sendMessageDto: SendMessageDto
  ): Promise<{ success: boolean }> {
    return this.chatsService.sendMessage(chatId, sendMessageDto);
  }
}
