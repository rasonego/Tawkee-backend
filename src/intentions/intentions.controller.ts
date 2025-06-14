import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IntentionsService } from './intentions.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { CreateIntentionDto } from './dto/create-intention.dto';
import { UpdateIntentionDto } from './dto/update-intention.dto';
import { IntentionDto } from './dto/intention.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { PaginatedIntentionsResponseDto } from './dto/paginated-intentions-response.dto';
import { AuthGuard } from '../auth/auth.guard';

@ApiTags('Intentions')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class IntentionsController {
  constructor(private readonly intentionsService: IntentionsService) {}

  @Get('agent/:agentId/intentions')
  @ApiOperation({ summary: 'List agent intentions' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a list of intentions',
    type: PaginatedIntentionsResponseDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiPaginationQueries()
  async findAll(
    @Param('agentId') agentId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedResult<IntentionDto>> {
    return this.intentionsService.findAll(agentId, paginationDto);
  }

  @Post('agent/:agentId/intentions')
  @ApiOperation({ summary: 'Create a new intention' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Returns the created intention',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async create(
    @Param('agentId') agentId: string,
    @Body() createIntentionDto: CreateIntentionDto
  ): Promise<IntentionDto> {
    return this.intentionsService.create(agentId, createIntentionDto);
  }

  @Put('intention/:intentionId')
  @ApiOperation({ summary: 'Update an intention' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Intention updated successfully',
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
    description: 'Intention not found',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'intentionId', description: 'Intention ID' })
  async update(
    @Param('intentionId') intentionId: string,
    @Body() updateIntentionDto: UpdateIntentionDto
  ): Promise<{ success: boolean }> {
    return this.intentionsService.update(intentionId, updateIntentionDto);
  }

  @Delete('intention/:intentionId')
  @ApiOperation({ summary: 'Remove an intention' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Intention removed successfully',
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
    description: 'Intention not found',
  })
  @ApiParam({ name: 'intentionId', description: 'Intention ID' })
  async remove(
    @Param('intentionId') intentionId: string
  ): Promise<{ success: boolean }> {
    return this.intentionsService.remove(intentionId);
  }

  @Post('agent/:agentId/intentions/google-calendar/schedule-meeting')
  @ApiOperation({
    summary: 'Create Google Calendar scheduling intention',
    description:
      'Creates a webhook intention to schedule meetings using Google Calendar API',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Google Calendar intention created successfully',
    type: IntentionDto,
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Agent not found' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async createGoogleCalendarIntention(
    @Param('agentId') agentId: string
  ): Promise<IntentionDto> {
    return this.intentionsService.registerGoogleCalendarIntentions(agentId);
  }
}
