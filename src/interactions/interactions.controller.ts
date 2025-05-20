import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { InteractionMessageDto } from './dto/interaction-message.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { PaginatedInteractionsResponseDto } from './dto/paginated-interactions-response.dto';
import { ResolveInteractionDto } from './dto/resolve-interaction.dto';
import { WarnInteractionDto } from './dto/warn-interaction.dto';
import { FindIdleInteractionsDto } from './dto/find-idle-interactions.dto';

@ApiTags('Interactions')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get('workspace/:workspaceId/interactions')
  @ApiOperation({
    summary: 'List interactions for a workspace',
    description:
      'Returns all interactions for a workspace with optional filtering by agent ID and pagination',
  })
  @ApiParam({
    name: 'workspaceId',
    description: 'ID of the workspace to list interactions for',
    required: true,
  })
  @ApiQuery({
    name: 'agentId',
    description: 'Optional agent ID to filter interactions',
    required: false,
  })
  @ApiPaginationQueries()
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The interactions have been successfully retrieved',
    type: PaginatedInteractionsResponseDto,
  })
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() paginationDto: PaginationDto,
    @Query('agentId') agentId?: string
  ): Promise<PaginatedInteractionsResponseDto> {
    return this.interactionsService.findAllByWorkspace(
      workspaceId,
      paginationDto,
      agentId
    );
  }

  @Get('interaction/:interactionId/messages')
  @ApiOperation({
    summary: 'Get messages for an interaction',
    description: 'Returns all messages associated with a specific interaction',
  })
  @ApiParam({
    name: 'interactionId',
    description: 'ID of the interaction to get messages for',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'The messages have been successfully retrieved',
    type: [InteractionMessageDto],
  })
  async getMessages(
    @Param('interactionId') interactionId: string
  ): Promise<InteractionMessageDto[]> {
    return this.interactionsService.findMessagesById(interactionId);
  }

  @Post('interaction/:interactionId/resolve')
  @ApiOperation({
    summary: 'Resolve an interaction',
    description: 'Mark an interaction as resolved',
  })
  @ApiParam({
    name: 'interactionId',
    description: 'ID of the interaction to resolve',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Interaction resolved successfully',
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
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Interaction not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Interaction already resolved',
  })
  async resolveInteraction(
    @Param('interactionId') interactionId: string,
    @Body() resolveDto: ResolveInteractionDto
  ): Promise<{ success: boolean }> {
    return this.interactionsService.resolveInteraction(
      interactionId,
      resolveDto.resolution
    );
  }

  @Put('interaction/:interactionId/warn')
  @ApiOperation({
    summary: 'Send warning before closing interaction',
    description:
      'Sends a warning message to the user and sets interaction to WAITING status',
  })
  @ApiParam({
    name: 'interactionId',
    description: 'ID of the interaction to warn',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Warning sent successfully',
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
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Interaction not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid interaction status',
  })
  async warnInteraction(
    @Param('interactionId') interactionId: string,
    @Body() warnDto: WarnInteractionDto
  ): Promise<{ success: boolean }> {
    return this.interactionsService.warnBeforeClosing(
      interactionId,
      warnDto.warningMessage
    );
  }

  @Get('interactions/idle')
  @ApiOperation({
    summary: 'Find idle interactions',
    description:
      'Finds interactions that need warnings or auto-closure due to inactivity',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns lists of idle interactions',
    schema: {
      type: 'object',
      properties: {
        warningNeeded: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              chatId: { type: 'string' },
            },
          },
        },
        closureNeeded: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              chatId: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async findIdleInteractions(
    @Query() idleDto: FindIdleInteractionsDto
  ): Promise<{
    warningNeeded: { id: string; chatId: string }[];
    closureNeeded: { id: string; chatId: string }[];
  }> {
    return this.interactionsService.findIdleInteractions(
      idleDto.runningIdleMinutes,
      idleDto.waitingIdleMinutes
    );
  }

  @Post('interactions/process-idle')
  @ApiOperation({
    summary: 'Process idle interactions',
    description:
      'Automatically warns and/or closes interactions based on inactivity time',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns statistics about processed interactions',
    schema: {
      type: 'object',
      properties: {
        warned: { type: 'number' },
        closed: { type: 'number' },
      },
    },
  })
  async processIdleInteractions(
    @Body() idleDto: FindIdleInteractionsDto
  ): Promise<{ warned: number; closed: number }> {
    return this.interactionsService.processIdleInteractions(
      idleDto.runningIdleMinutes,
      idleDto.waitingIdleMinutes
    );
  }
}
