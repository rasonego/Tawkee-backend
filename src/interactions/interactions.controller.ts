import {
  Controller,
  Get,
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
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { ResolveInteractionDto } from './dto/resolve-interaction.dto';
import { PaginatedInteractionsWithMessagesResponseDto } from './paginated-interactions-with-messages-response.dto';

@ApiTags('Interactions')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get('chats/:chatId/interactions')
  @ApiOperation({
    summary: 'List interactions for a specific chat, including messages',
    description:
      'Returns paginated interactions for a given chat ID, with associated messages included for each interaction.',
  })
  @ApiParam({
    name: 'chatId',
    description: 'ID of the chat to list interactions for',
    required: true,
    type: String,
  })
  @ApiPaginationQueries()
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'The interactions and their messages have been successfully retrieved.',
    type: PaginatedInteractionsWithMessagesResponseDto,
  })
  async findInteractionsByChat(
    @Param('chatId') chatId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedInteractionsWithMessagesResponseDto> {
    return this.interactionsService.findInteractionsByChatWithMessages(
      chatId,
      paginationDto
    );
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
}
