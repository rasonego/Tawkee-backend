import {
  Controller,
  Get,
  Post,
  Put,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TrainingType } from './dto/training.dto';
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
  @ApiQuery({
    name: 'type',
    required: false,
    enum: TrainingType,
    description: 'Filter by training type',
  })
  async findAll(
    @Param('agentId') agentId: string,
    @Query() paginationDto: PaginationDto,
    @Query('type') type?: TrainingType
  ): Promise<PaginatedTrainingsResponseDto> {
    return this.trainingsService.findAll(agentId, paginationDto, type);
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
  ): Promise<{ success: boolean }> {
    return this.trainingsService.create(agentId, createTrainingDto);
  }

  @Put('training/:trainingId')
  @ApiOperation({ summary: 'Update a training' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the update was successful or not',
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
  async update(
    @Param('trainingId') trainingId: string,
    @Body() updateTrainingDto: UpdateTrainingDto
  ): Promise<{ success: boolean }> {
    return this.trainingsService.update(trainingId, updateTrainingDto);
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
