import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateIntentionDto } from './dto/create-intention.dto';
import { UpdateIntentionDto } from './dto/update-intention.dto';
import { 
  createGoogleCalendarIntention,
  suggestAvailableGoogleMeetingSlotsIntention,
  cancelGoogleCalendarMeetingIntention
} from './google-calendar/google-calendar-intention';
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

  async remove(id?: string, agentId?: string, toolName?: string): Promise<{ success: boolean }> {
    // console.log('🗑️ [remove] Attempting to remove intention...');
    console.log('🔍 [remove] Received parameters:', { id, agentId, toolName });

    let whereClause: Prisma.IntentionWhereInput | null = null;

    if (id) {
      whereClause = { id };
      console.log('📌 [remove] Built where clause using id:', whereClause);
    } else if (agentId && toolName) {
      whereClause = { agentId, toolName };
      console.log('📌 [remove] Built where clause using agentId and toolName:', whereClause);
    } else {
      console.warn('⚠️ [remove] Invalid parameters. Either `id` or both `agentId` and `toolName` must be provided.');
      throw new BadRequestException('Must provide either id or both agentId and toolName.');
    }

    const intention = await this.prisma.intention.findFirst({ where: whereClause });

    if (!intention) {
      // console.warn('❌ [remove] No matching intention found for:', whereClause);
      throw new NotFoundException(
        `Intention with ID ${id} or agentId ${agentId} & toolName ${toolName} not found`
      );
    }

    // console.log('✅ [remove] Found intention. Proceeding to delete:', { intentionId: intention.id });

    await this.prisma.intention.delete({
      where: { id: intention.id },
    });

    // console.log('🧹 [remove] Successfully deleted intention:', { deletedId: intention.id });

    return { success: true };
  }


  async registerGoogleCalendarIntentions(agentId: string) {
    await this.agentsService.findOne(agentId);

    await this.registerGoogleCalendarSuggestSlotsIntention(agentId);
    await this.registerGoogleCalendarCancelMeetingIntention(agentId);
    return await this.registerGoogleCalendarScheduleIntention(agentId);
  }

  async removeGoogleCalendarIntentions(agentId: string) {
    await this.agentsService.findOne(agentId);

    await this.remove(undefined, agentId, 'schedule_google_meeting');
    await this.remove(undefined, agentId, 'cancel_google_meeting');
    await this.remove(undefined, agentId, 'suggest_available_google_meeting_slots');
    
    return await this.registerGoogleCalendarScheduleIntention(agentId);
  }

  private async registerGoogleCalendarScheduleIntention(agentId: string) {
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

  private async registerGoogleCalendarSuggestSlotsIntention(agentId: string) {
    const {
      fields,
      headers,
      authentication,       // ❌ runtime-only, stripped
      responseProcessing,   // ❌ runtime-only, stripped
      ...intentionData
    } = suggestAvailableGoogleMeetingSlotsIntention;

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

  private async registerGoogleCalendarCancelMeetingIntention(agentId: string) {
    const {
      fields,
      headers,
      preconditions,
      queryParams,          // ✅ Extract queryParams from root level
      authentication,       // ❌ runtime-only, stripped
      responseProcessing,   // ❌ runtime-only, stripped
      errorHandling,        // ❌ runtime-only, stripped
      ...intentionData
    } = cancelGoogleCalendarMeetingIntention;

    const formattedPreconditions = (preconditions || []).map(pre => ({
      name: pre.name,
      url: pre.url,
      httpMethod: pre.httpMethod,
      failureCondition: pre.failureCondition,
      failureMessage: pre.failureMessage,
      successAction: pre.successAction, // ✅ Include successAction if it exists
      headers: {
        create: pre.headers || [],
      },
      queryParams: pre.queryParams?.length
        ? { create: pre.queryParams }
        : undefined,
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

    // ✅ Format root-level queryParams as params for Prisma
    const formattedParams = (queryParams || []).map(param => ({
      name: param.name,
      value: param.value,
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
          params: {     
            create: formattedParams,
          },
          preconditions: {
            create: formattedPreconditions,
          },
        },
        include: {
          fields: true,
          headers: true,
          params: true,      
          preconditions: { 
            include: {
              headers: true,
              queryParams: true,
            },
          },
        },
      });

      return intention;
    });
  }
}
