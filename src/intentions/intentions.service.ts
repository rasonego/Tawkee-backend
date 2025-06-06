import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateIntentionDto } from './dto/create-intention.dto';
import { UpdateIntentionDto } from './dto/update-intention.dto';
import { createGoogleCalendarIntention } from './google-calendar-intention';
import { FieldType, PreprocessingType, Prisma } from '@prisma/client';

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

    const existing = await this.prisma.intention.findUnique({
      where: { toolName: createIntentionDto.toolName },
    });

    if (existing) {
      throw new BadRequestException(`An intention with toolName "${createIntentionDto.toolName}" already exists.`);
    }

    // Extract nested data
    const { fields, headers, params, preconditions, ...intentionData } = createIntentionDto;

    const formattedPreconditions = (preconditions || []).map(p => ({
      name: p.name,
      url: p.url,
      httpMethod: p.httpMethod,
      requestBody: p.requestBody,
      failureCondition: p.failureCondition,
      failureMessage: p.failureMessage,
      headers: {
        create: p.headers || []
      }
    }));

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
          preconditions: { create: formattedPreconditions },
        },
        include: {
          fields: true,
          headers: true,
          params: true,
          preconditions: true
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
    const { fields, headers, params, preconditions, ...intentionData } = updateIntentionDto;

    // Update intention with nested data in a transaction
    await this.prisma.$transaction(async (prisma) => {
      // First, delete existing related records
      await prisma.intentionField.deleteMany({ where: { intentionId: id } });
      await prisma.intentionHeader.deleteMany({ where: { intentionId: id } });
      await prisma.intentionParam.deleteMany({ where: { intentionId: id } });

      const formattedPreconditions = (preconditions || []).map(p => ({
        name: p.name,
        url: p.url,
        httpMethod: p.httpMethod,
        requestBody: p.requestBody,
        failureCondition: p.failureCondition,
        failureMessage: p.failureMessage,
        headers: {
          create: p.headers || []
        }
      }));

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
          preconditions: {
            create: formattedPreconditions
          }
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

  async registerGoogleCalendarIntention(agentId: string) {
    await this.agentsService.findOne(agentId);

    const {
      fields,
      headers,
      preconditions,
      authentication,       // ❌ runtime-only, stripped
      errorHandling,        // ❌ runtime-only, stripped
      responseProcessing,   // ❌ runtime-only, stripped
      ...intentionData
    } = createGoogleCalendarIntention;

    const formattedPreconditions = (preconditions || []).map(pre => ({
      name: pre.name,
      url: pre.url,
      httpMethod: pre.httpMethod,
      requestBody: pre.requestBody,
      failureCondition: pre.failureCondition,
      failureMessage: pre.failureMessage,
      headers: {
        create: pre.headers || [],
      },
    }));

    const normalizeFieldType = (raw: string): FieldType => {
      const map: Record<string, FieldType> = {
        TEXT: FieldType.TEXT,
        BOOLEAN: FieldType.BOOLEAN,
        NUMBER: FieldType.NUMBER,
        DATE: FieldType.DATE,
        DATETIME: FieldType.DATE_TIME,
        DATE_TIME: FieldType.DATE_TIME,
        URL: FieldType.URL,
      };

      const key = raw.toUpperCase();
      const normalized = map[key];

      if (!normalized) {
        throw new Error(`Invalid field type: "${raw}"`);
      }

      return normalized;
    };

    const castedFields = (fields || []).map(({ validation, defaultValue, ...field }) => ({
      ...field,
      type: normalizeFieldType(field.type),
    }));

    return this.prisma.$transaction(async (prisma) => {
      const intention = await prisma.intention.create({
        data: {
          ...intentionData,
          preprocessingMessage: intentionData.preprocessingMessage as PreprocessingType,
          agent: {
            connect: { id: agentId },
          },
          fields: {
            create: castedFields,
          },
          headers: {
            create: headers || [],
          },
          preconditions: { create: formattedPreconditions },
        } as Prisma.IntentionCreateInput,
        include: {
          fields: true,
          headers: true,
          params: true
        },
      });

      return intention;
    });
  }
}
