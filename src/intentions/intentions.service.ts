import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateIntentionDto } from './dto/create-intention.dto';
import { UpdateIntentionDto } from './dto/update-intention.dto';

@Injectable()
export class IntentionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService
  ) {}

  async findAll(agentId: string, paginationDto: PaginationDto) {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    const { page, pageSize, query } = paginationDto;

    const skip = (page - 1) * pageSize;

    const where = {
      agentId,
      ...(query
        ? { description: { contains: query, mode: 'insensitive' as any } }
        : {}),
    };

    const [intentions, total] = await Promise.all([
      this.prisma.intention.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          fields: true,
          headers: true,
          params: true,
        },
      }),
      this.prisma.intention.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: intentions,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
      },
    };
  }

  async create(agentId: string, createIntentionDto: CreateIntentionDto) {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    // Extract nested data
    const { fields, headers, params, ...intentionData } = createIntentionDto;

    // Create intention with nested data in a transaction
    return this.prisma.$transaction(async (prisma) => {
      const intention = await prisma.intention.create({
        data: {
          ...intentionData,
          agentId,
          fields: {
            create: fields || [],
          },
          headers: {
            create: headers || [],
          },
          params: {
            create: params || [],
          },
        },
        include: {
          fields: true,
          headers: true,
          params: true,
        },
      });

      return intention;
    });
  }

  async update(
    id: string,
    updateIntentionDto: UpdateIntentionDto
  ): Promise<{ success: boolean }> {
    // Ensure intention exists
    const intention = await this.prisma.intention.findUnique({
      where: { id },
    });

    if (!intention) {
      throw new NotFoundException(`Intention with ID ${id} not found`);
    }

    // Extract nested data
    const { fields, headers, params, ...intentionData } = updateIntentionDto;

    // Update intention with nested data in a transaction
    await this.prisma.$transaction(async (prisma) => {
      // First, delete existing related records
      await prisma.intentionField.deleteMany({ where: { intentionId: id } });
      await prisma.intentionHeader.deleteMany({ where: { intentionId: id } });
      await prisma.intentionParam.deleteMany({ where: { intentionId: id } });

      // Then update intention and create new related records
      await prisma.intention.update({
        where: { id },
        data: {
          ...intentionData,
          fields: {
            create: fields || [],
          },
          headers: {
            create: headers || [],
          },
          params: {
            create: params || [],
          },
        },
      });
    });

    return { success: true };
  }

  async remove(id: string): Promise<{ success: boolean }> {
    // Ensure intention exists
    const intention = await this.prisma.intention.findUnique({
      where: { id },
    });

    if (!intention) {
      throw new NotFoundException(`Intention with ID ${id} not found`);
    }

    // Delete intention (cascading will handle related records)
    await this.prisma.intention.delete({
      where: { id },
    });

    return { success: true };
  }
}
