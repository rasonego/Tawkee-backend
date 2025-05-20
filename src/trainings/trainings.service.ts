import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TrainingDto, TrainingType } from './dto/training.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';

@Injectable()
export class TrainingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService
  ) {}

  async findAll(
    agentId: string,
    paginationDto: PaginationDto,
    type?: TrainingType
  ): Promise<PaginatedResult<TrainingDto>> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    const { page, pageSize, query } = paginationDto;

    const skip = (page - 1) * pageSize;

    const where = {
      agentId,
      ...(type ? { type } : {}),
      ...(query
        ? {
            OR: [
              { text: { contains: query, mode: 'insensitive' as any } },
              { documentName: { contains: query, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    // Get total count for pagination metadata
    const total = await this.prisma.training.count({ where });

    // Get trainings with pagination
    const trainings = await this.prisma.training.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });

    // Return paginated result format
    return {
      data: trainings,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async create(
    agentId: string,
    createTrainingDto: CreateTrainingDto
  ): Promise<{ success: boolean }> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    // Validate training data based on type
    this.validateTrainingData(createTrainingDto);

    await this.prisma.training.create({
      data: {
        ...createTrainingDto,
        agentId,
      },
    });

    return { success: true };
  }

  async update(
    id: string,
    updateTrainingDto: UpdateTrainingDto
  ): Promise<{ success: boolean }> {
    // Ensure training exists
    const training = await this.prisma.training.findUnique({
      where: { id },
    });

    if (!training) {
      throw new NotFoundException(`Training with ID ${id} not found`);
    }

    // Currently only TEXT type is available for update
    if (updateTrainingDto.type !== TrainingType.TEXT) {
      throw new BadRequestException('Only TEXT type trainings can be updated');
    }

    // Validate training data based on type
    this.validateTrainingData(updateTrainingDto);

    await this.prisma.training.update({
      where: { id },
      data: updateTrainingDto,
    });

    return { success: true };
  }

  async remove(id: string): Promise<{ success: boolean }> {
    // Ensure training exists
    const training = await this.prisma.training.findUnique({
      where: { id },
    });

    if (!training) {
      throw new NotFoundException(`Training with ID ${id} not found`);
    }

    await this.prisma.training.delete({
      where: { id },
    });

    return { success: true };
  }

  private validateTrainingData(
    trainingData: CreateTrainingDto | UpdateTrainingDto
  ) {
    switch (trainingData.type) {
      case TrainingType.TEXT:
        if (!trainingData.text) {
          throw new BadRequestException(
            'Text is required for TEXT type training'
          );
        }
        break;
      case TrainingType.WEBSITE:
        // Only check 'website' for CreateTrainingDto
        if ('website' in trainingData && !trainingData.website) {
          throw new BadRequestException(
            'Website URL is required for WEBSITE type training'
          );
        }
        break;
      case TrainingType.VIDEO:
        // Only check 'video' for CreateTrainingDto
        if ('video' in trainingData && !trainingData.video) {
          throw new BadRequestException(
            'Video URL is required for VIDEO type training'
          );
        }
        break;
      case TrainingType.DOCUMENT:
        // Only check document props for CreateTrainingDto
        if (
          'documentUrl' in trainingData &&
          'documentName' in trainingData &&
          'documentMimetype' in trainingData
        ) {
          if (
            !trainingData.documentUrl ||
            !trainingData.documentName ||
            !trainingData.documentMimetype
          ) {
            throw new BadRequestException(
              'Document URL, name, and MIME type are required for DOCUMENT type training'
            );
          }
        }
        break;
      default:
        throw new BadRequestException('Invalid training type');
    }
  }
}
