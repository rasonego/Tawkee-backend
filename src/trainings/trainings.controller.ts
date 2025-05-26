import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTrainingDto } from './dto/create-training.dto';
import { TrainingDto } from './dto/training.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { PaginatedTrainingsResponseDto } from './dto/paginated-trainings-response.dto';

@ApiTags('Trainings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class TrainingsController {
  constructor(private readonly trainingsService: TrainingsService) {}

  @Get('agent/:agentId/trainings')
  @ApiOperation({ summary: 'List agent trainings' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns a paginated list of training material',
    type: PaginatedTrainingsResponseDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  @ApiPaginationQueries()
  async findAll(
    @Param('agentId') agentId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedTrainingsResponseDto> {
    return this.trainingsService.findAll(agentId, paginationDto);
  }

  @Post('agent/:agentId/trainings')
  @ApiOperation({ summary: 'Create a new training' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the training was successful or not',
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
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async create(
    @Param('agentId') agentId: string,
    @Body() createTrainingDto: CreateTrainingDto
  ): Promise<TrainingDto> {
    return this.trainingsService.create(agentId, createTrainingDto);
  }

  @Delete('training/:trainingId')
  @ApiOperation({ summary: 'Remove a training' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the operation was successful or not',
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
  @ApiParam({ name: 'trainingId', description: 'Training ID' })
  async remove(
    @Param('trainingId') trainingId: string
  ): Promise<{ success: boolean }> {
    return this.trainingsService.remove(trainingId);
  }
}
