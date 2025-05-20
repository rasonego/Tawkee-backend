import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TrainingDto, TrainingType } from './dto/training.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';

@Injectable()
export class TrainingsService {
  private readonly logger = new Logger(TrainingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly qdrantService: QdrantService,
  ) {}

  async findAll(
    agentId: string,
    paginationDto: PaginationDto,
    type?: TrainingType,
  ): Promise<PaginatedResult<TrainingDto>> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    const { page, pageSize, query } = paginationDto;
    
    const skip = (page - 1) * pageSize;
    
    const where = {
      agentId,
      ...(type ? { type } : {}),
      ...(query ? {
        OR: [
          { text: { contains: query, mode: 'insensitive' as any } },
          { documentName: { contains: query, mode: 'insensitive' as any } },
        ],
      } : {}),
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
      }
    };
  }

  async create(
    agentId: string,
    createTrainingDto: CreateTrainingDto,
  ): Promise<{ success: boolean }> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    // Validate training data based on type
    this.validateTrainingData(createTrainingDto);

    // Create training in database
    const training = await this.prisma.training.create({
      data: {
        ...createTrainingDto,
        agentId,
      },
    });

    // For text-based trainings, store in vector database for RAG
    try {
      if (createTrainingDto.type === TrainingType.TEXT && createTrainingDto.text) {
        this.logger.log(`Storing training ${training.id} in vector database`);
        await this.qdrantService.storeTraining(
          training.id, 
          agentId, 
          createTrainingDto.text,
          { documentName: createTrainingDto.documentName || 'Untitled training' }
        );
      }
    } catch (error) {
      this.logger.error(`Failed to store training in vector database: ${error.message}`);
      // Continue execution even if vector storage fails - database record is still created
    }

    return { success: true };
  }

  async update(
    id: string,
    updateTrainingDto: UpdateTrainingDto,
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

    // Update the training record in the database
    const updatedTraining = await this.prisma.training.update({
      where: { id },
      data: updateTrainingDto,
    });

    // For text-based trainings, update in vector database
    try {
      if (updateTrainingDto.type === TrainingType.TEXT && updateTrainingDto.text) {
        this.logger.log(`Updating training ${id} in vector database`);
        
        // Delete old vectors first (to avoid duplicates)
        await this.qdrantService.deleteTraining(id);
        
        // Store updated text as new vectors
        await this.qdrantService.storeTraining(
          id,
          training.agentId,
          updateTrainingDto.text,
          { documentName: training.documentName || 'Updated training' }
        );
      }
    } catch (error) {
      this.logger.error(`Failed to update training in vector database: ${error.message}`);
      // Continue execution even if vector storage fails - database record is still updated
    }

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

    // Delete from database
    await this.prisma.training.delete({
      where: { id },
    });

    // Also delete from vector database if it's a TEXT type training
    if (training.type === TrainingType.TEXT) {
      try {
        this.logger.log(`Deleting training ${id} from vector database`);
        await this.qdrantService.deleteTraining(id);
      } catch (error) {
        this.logger.error(`Failed to delete training from vector database: ${error.message}`);
        // Continue execution even if vector deletion fails - database record is still deleted
      }
    }

    return { success: true };
  }
  
  /**
   * Search for relevant training materials using RAG
   * @param agentId The agent ID to search trainings for
   * @param query The user query to search relevant training materials for
   * @param limit Maximum number of results to return
   * @returns Array of relevant training materials with similarity scores
   */
  async searchRelevantTrainings(
    agentId: string,
    query: string,
    limit: number = 5,
  ): Promise<{
    text: string;
    trainingId: string;
    similarity: number;
  }[]> {
    try {
      this.logger.log(`Searching for relevant trainings for agent ${agentId} with query: ${query}`);
      return await this.qdrantService.findSimilarTrainings(query, agentId, limit);
    } catch (error) {
      this.logger.error(`Error searching relevant trainings: ${error.message}`);
      return [];
    }
  }

  private validateTrainingData(trainingData: CreateTrainingDto | UpdateTrainingDto) {
    switch (trainingData.type) {
      case TrainingType.TEXT:
        if (!trainingData.text) {
          throw new BadRequestException('Text is required for TEXT type training');
        }
        break;
      case TrainingType.WEBSITE:
        // Only check 'website' for CreateTrainingDto
        if ('website' in trainingData && !trainingData.website) {
          throw new BadRequestException('Website URL is required for WEBSITE type training');
        }
        break;
      case TrainingType.VIDEO:
        // Only check 'video' for CreateTrainingDto
        if ('video' in trainingData && !trainingData.video) {
          throw new BadRequestException('Video URL is required for VIDEO type training');
        }
        break;
      case TrainingType.DOCUMENT:
        // Only check document props for CreateTrainingDto
        if ('documentUrl' in trainingData && 'documentName' in trainingData && 'documentMimetype' in trainingData) {
          if (!trainingData.documentUrl || !trainingData.documentName || !trainingData.documentMimetype) {
            throw new BadRequestException('Document URL, name, and MIME type are required for DOCUMENT type training');
          }
        }
        break;
      default:
        throw new BadRequestException('Invalid training type');
    }
  }
}
