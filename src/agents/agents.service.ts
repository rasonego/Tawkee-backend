import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OverrideValue,
  WorkspacesService,
} from '../workspaces/workspaces.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { EnhancedAgentDto } from './dto/enhanced-agent.dto';
import { ResponseDelayOptions, AIModel, Prisma } from '@prisma/client';
import { AvailableTimesDto } from 'src/intentions/google-calendar/schedule-validation/dto/schedule-validation.dto';
import { WahaApiService } from 'src/waha-api/waha-api.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { subDays } from 'date-fns';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly wahaApiService: WahaApiService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async permanentlyDeleteStaleAgentsTask() {
    this.logger.log(
      'Running daily task to permanently delete agents soft-deleted over 60 days ago...'
    );

    const cutoffDate = subDays(new Date(), 60);

    const agentsToDelete = await this.prisma.agent.findMany({
      where: {
        isDeleted: true,
        updatedAt: {
          lte: cutoffDate,
        },
      },
      select: {
        id: true,
      },
    });

    if (agentsToDelete.length === 0) {
      this.logger.log('No soft-deleted agents older than 60 days found.');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    for (const { id } of agentsToDelete) {
      try {
        const result = await this.remove(id, true);
        if (result.deletedPermanently) {
          successCount++;
          this.logger.log(`Permanently deleted agent ${id}`);
        } else {
          this.logger.warn(`Agent ${id} was not deleted permanently.`);
        }
      } catch (error) {
        failureCount++;
        this.logger.error(
          `Failed to permanently delete agent ${id}: ${error.message}`
        );
      }
    }

    this.logger.log(
      `Finished permanent deletion of agents. Success: ${successCount}, Failures: ${failureCount}`
    );
  }

  async findAll(
    workspaceId: string,
    paginationDto: PaginationDto,
    asAdmin: boolean = false
  ) {
    // Ensure the workspace exists
    await this.workspacesService.findOne(workspaceId);

    const { page, pageSize, query } = paginationDto;

    const skip = (page - 1) * pageSize;

    const where = {
      workspaceId,
      ...(asAdmin ? {} : { isDeleted: false }), // Skip if condition is true
      ...(query
        ? { name: { contains: query, mode: 'insensitive' as any } }
        : {}),
    };

    // Get total count for pagination metadata
    const total = await this.prisma.agent.count({
      where: {
        workspaceId,
        isDeleted: false,
        ...(query
          ? { name: { contains: query, mode: 'insensitive' as any } }
          : {}),
      },
    });

    // Calculate total pages
    const totalPages = Math.ceil(total / pageSize);

    const agents = await this.prisma.agent.findMany({
      where,
      skip,
      take: pageSize,
      select: {
        id: true,
        workspaceId: true,
        name: true,
        behavior: true,
        avatar: true,
        communicationType: true,
        type: true,
        jobName: true,
        jobSite: true,
        jobDescription: true,
        isActive: true,
        isDeleted: true,
        settings: {
          select: {
            preferredModel: true,
            timezone: true,
            enabledHumanTransfer: true,
            enabledReminder: true,
            reminderIntervalMinutes: true,
            splitMessages: true,
            enabledEmoji: true,
            limitSubjects: true,
            responseDelaySeconds: true,
          },
        },
        scheduleSettings: {
          select: {
            email: true,
            availableTimes: true,
            minAdvanceMinutes: true,
            maxAdvanceDays: true,
            maxEventDuration: true,
            alwaysOpen: true,
            askForContactName: true,
            askForContactPhone: true,
            askForMeetingDuration: true,
          },
        },
        elevenLabsSettings: {
          select: {
            connected: true,
            respondAudioWithAudio: true,
            alwaysRespondWithAudio: true,
            stability: true,
            similarityBoost: true,
            selectedElevenLabsVoiceId: true,
            subscriptionTier: true,
            characterCount: true,
            characterLimit: true,
            userName: true,
          },
        },
        webhooks: {
          select: {
            onNewMessage: true,
            onLackKnowLedge: true,
            onTransfer: true,
            onFinishAttendance: true,
          },
        },
        channels: {
          select: {
            id: true,
            name: true,
            type: true,
            connected: true,
            config: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    let subscription: any;
    if (asAdmin) {
      subscription = await this.prisma.subscription.findFirst({
        where: { workspaceId },
        select: {
          agentLimitOverrides: true,
          plan: {
            select: {
              agentLimit: true,
            },
          },
        },
      });
    }

    // Transform the data to match the EnhancedAgentDto structure
    const enhancedAgents = agents.map((agent) => {
      // Destructure the agent object including channels
      const { settings, webhooks, channels, ...agentData } = agent as any;

      return {
        agent: {
          ...agentData,
          channels: channels || [],
        },
        settings: settings || {
          preferredModel: AIModel.GPT_4_1,
          timezone: '(GMT+00:00) London',
          enabledHumanTransfer: true,
          enabledReminder: true,
          splitMessages: true,
          reminderIntervalMinutes: true,
          enabledEmoji: true,
          limitSubjects: true,
          responseDelaySeconds: 5,
        },
        webhooks: webhooks || {
          onNewMessage: null,
          onLackKnowLedge: null,
          onTransfer: null,
          onFinishAttendance: null,
        },
      };
    });

    const agentLimitOverrides =
      subscription?.agentLimitOverrides as OverrideValue;

    return {
      data: enhancedAgents,
      meta: {
        total,
        page,
        pageSize,
        totalPages,
      },
      subscriptionLimits: {
        agentLimit: agentLimitOverrides?.explicitlySet
          ? agentLimitOverrides.value
          : subscription?.plan?.agentLimit,
      },
    };
  }

  async create(
    workspaceId: string,
    createAgentDto: CreateAgentDto
  ): Promise<EnhancedAgentDto> {
    // Ensure the workspace exists
    await this.workspacesService.findOne(workspaceId);

    // Use a transaction to create the agent and related data
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the agent first
      const agent = await tx.agent.create({
        data: {
          ...createAgentDto,
          workspaceId,
        },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          behavior: true,
          avatar: true,
          communicationType: true,
          type: true,
          jobName: true,
          jobSite: true,
          jobDescription: true,
          isActive: true,
        },
      });

      // Create agent settings
      const settings = await tx.agentSettings.create({
        data: {
          agentId: agent.id,
          preferredModel: AIModel.GPT_4_1,
          timezone: '(GMT+00:00) London',
          enabledHumanTransfer: true,
          enabledReminder: true,
          splitMessages: true,
          enabledEmoji: true,
          limitSubjects: true,
          responseDelaySeconds: ResponseDelayOptions.FIVE_SECONDS,
        },
      });

      // Create agent webhooks
      const webhooks = await tx.agentWebhooks.create({
        data: {
          agentId: agent.id,
          onNewMessage: null,
          onLackKnowLedge: null,
          onTransfer: null,
          onFinishAttendance: null,
        },
      });

      const defaultAvailableTimes = {
        monday: [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
        tuesday: [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
        wednesday: [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
        thursday: [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
        friday: [
          ['09:00', '12:00'],
          ['13:00', '18:00'],
        ],
      };

      const scheduleSettings = await tx.scheduleSettings.create({
        data: {
          agentId: agent.id,
          minAdvanceMinutes: 120,
          maxAdvanceDays: 15,
          maxEventDuration: 60,
          alwaysOpen: false,
          availableTimes: defaultAvailableTimes,
          askForContactName: true,
          askForContactPhone: false,
          askForMeetingDuration: false,
        },
      });

      const elevenLabsSettings = await tx.elevenLabsSettings.create({
        data: {
          agentId: agent.id,
          selectedElevenLabsVoiceId: '',
          subscriptionTier: 'free',
          characterCount: 10000,
          characterLimit: 10000,
          userName: 'unkown',
        },
      });

      return {
        agent,
        settings,
        webhooks,
        scheduleSettings,
        elevenLabsSettings,
      };
    });

    // Return the combined data as EnhancedAgentDto
    return {
      agent: {
        ...result.agent,
        channels: [],
        intentions: [],
      },
      settings: {
        preferredModel: result.settings.preferredModel,
        timezone: result.settings.timezone,
        enabledHumanTransfer: result.settings.enabledHumanTransfer,
        enabledReminder: result.settings.enabledReminder,
        reminderIntervalMinutes: result.settings.reminderIntervalMinutes,
        splitMessages: result.settings.splitMessages,
        enabledEmoji: result.settings.enabledEmoji,
        limitSubjects: result.settings.limitSubjects,
        responseDelaySeconds: result.settings.responseDelaySeconds,
      },
      webhooks: {
        onNewMessage: result.webhooks.onNewMessage,
        onLackKnowLedge: result.webhooks.onLackKnowLedge,
        onTransfer: result.webhooks.onTransfer,
        onFinishAttendance: result.webhooks.onFinishAttendance,
      },
      scheduleSettings: {
        minAdvanceMinutes: result.scheduleSettings.minAdvanceMinutes,
        maxAdvanceDays: result.scheduleSettings.maxAdvanceDays,
        maxEventDuration: result.scheduleSettings.maxEventDuration,
        alwaysOpen: result.scheduleSettings.alwaysOpen,
        availableTimes: result.scheduleSettings
          .availableTimes as AvailableTimesDto,
        askForContactName: result.scheduleSettings.askForContactName,
        askForContactPhone: result.scheduleSettings.askForContactPhone,
        askForMeetingDuration: result.scheduleSettings.askForMeetingDuration,
      },
      elevenLabsSettings: {
        subscriptionTier: 'free',
        characterCount: 10000,
        characterLimit: 10000,
        userName: 'unknown',
      },
    };
  }

  async findOne(id: string): Promise<EnhancedAgentDto> {
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        behavior: true,
        avatar: true,
        communicationType: true,
        type: true,
        jobName: true,
        jobSite: true,
        jobDescription: true,
        isActive: true,
        isDeleted: true,
        settings: {
          select: {
            preferredModel: true,
            timezone: true,
            enabledHumanTransfer: true,
            enabledReminder: true,
            reminderIntervalMinutes: true,
            splitMessages: true,
            enabledEmoji: true,
            limitSubjects: true,
            responseDelaySeconds: true,
          },
        },
        webhooks: {
          select: {
            onNewMessage: true,
            onLackKnowLedge: true,
            onTransfer: true,
            onFinishAttendance: true,
          },
        },
        channels: {
          select: {
            id: true,
            name: true,
            type: true,
            connected: true,
            config: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        scheduleSettings: {
          select: {
            email: true,
            availableTimes: true,
            minAdvanceMinutes: true,
            maxAdvanceDays: true,
            maxEventDuration: true,
            alwaysOpen: true,
            askForContactName: true,
            askForContactPhone: true,
            askForMeetingDuration: true,
          },
        },
        elevenLabsSettings: {
          select: {
            connected: true,
            respondAudioWithAudio: true,
            alwaysRespondWithAudio: true,
            stability: true,
            similarityBoost: true,
            selectedElevenLabsVoiceId: true,
            subscriptionTier: true,
            characterCount: true,
            characterLimit: true,
            userName: true,
          },
        },
        intentions: {
          select: {
            id: true,
            toolName: true,
            description: true,
            type: true,
            httpMethod: true,
            url: true,
            requestBody: true,
            preprocessingMessage: true,
            preprocessingText: true,
            autoGenerateParams: true,
            autoGenerateBody: true,
            fields: {
              select: {
                id: true,
                name: true,
                jsonName: true,
                description: true,
                type: true,
                required: true,
              },
            },
            headers: {
              select: {
                id: true,
                name: true,
                value: true,
              },
            },
            params: {
              select: {
                id: true,
                name: true,
                value: true,
              },
            },
            preconditions: {
              select: {
                id: true,
                name: true,
                url: true,
                httpMethod: true,
                requestBody: true,
                failureCondition: true,
                failureMessage: true,
                successAction: true,
                headers: {
                  select: {
                    id: true,
                    name: true,
                    value: true,
                  },
                },
                queryParams: {
                  select: {
                    id: true,
                    name: true,
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { workspaceId: agent.workspaceId },
      select: {
        featureOverrides: true,
        creditsLimitOverrides: true,
        agentLimitOverrides: true,
        trainingTextLimitOverrides: true,
        trainingWebsiteLimitOverrides: true,
        trainingVideoLimitOverrides: true,
        trainingDocumentLimitOverrides: true,
        plan: {
          select: {
            features: true,
            creditsLimit: true,
            agentLimit: true,
            trainingTextLimit: true,
            trainingWebsiteLimit: true,
            trainingVideoLimit: true,
            trainingDocumentLimit: true,
          },
        },
      },
    });

    const creditsLimitOverrides =
      subscription?.creditsLimitOverrides as OverrideValue;
    const agentLimitOverrides =
      subscription?.agentLimitOverrides as OverrideValue;
    const trainingTextLimitOverrides =
      subscription?.trainingTextLimitOverrides as OverrideValue;
    const trainingWebsiteLimitOverrides =
      subscription?.trainingWebsiteLimitOverrides as OverrideValue;
    const trainingVideoLimitOverrides =
      subscription?.trainingVideoLimitOverrides as OverrideValue;
    const trainingDocumentLimitOverrides =
      subscription?.trainingDocumentLimitOverrides as OverrideValue;

    const {
      settings,
      webhooks,
      channels,
      intentions,
      scheduleSettings,
      elevenLabsSettings,
      ...agentData
    } = agent as any;

    return {
      agent: {
        ...agentData,
        channels: channels || [],
        intentions: intentions || [],
      },
      settings: settings || {
        preferredModel: AIModel.GPT_4_1,
        timezone: '(GMT+00:00) London',
        enabledHumanTransfer: true,
        enabledReminder: true,
        reminderIntervalMinutes: 10,
        splitMessages: true,
        enabledEmoji: true,
        limitSubjects: true,
        responseDelaySeconds: 5,
      },
      webhooks: webhooks || {
        onNewMessage: null,
        onLackKnowLedge: null,
        onTransfer: null,
        onFinishAttendance: null,
      },
      scheduleSettings: {
        ...scheduleSettings,
        availableTimes: scheduleSettings.availableTimes as AvailableTimesDto,
      },
      elevenLabsSettings: {
        ...elevenLabsSettings,
      },
      subscriptionLimits: {
        agentLimit: agentLimitOverrides?.explicitlySet
          ? agentLimitOverrides.value
          : subscription.plan.agentLimit,
        creditsLimit: creditsLimitOverrides?.explicitlySet
          ? creditsLimitOverrides.value
          : subscription.plan.creditsLimit,
        trainingTextLimit: trainingTextLimitOverrides?.explicitlySet
          ? trainingTextLimitOverrides.value
          : subscription.plan.trainingTextLimit,
        trainingWebsiteLimit: trainingWebsiteLimitOverrides?.explicitlySet
          ? trainingWebsiteLimitOverrides.value
          : subscription.plan.trainingWebsiteLimit,
        trainingVideoLimit: trainingVideoLimitOverrides?.explicitlySet
          ? trainingVideoLimitOverrides.value
          : subscription.plan.trainingVideoLimit,
        trainingDocumentLimit: trainingDocumentLimitOverrides?.explicitlySet
          ? trainingDocumentLimitOverrides.value
          : subscription.plan.trainingDocumentLimit,
      },
    };
  }

  async update(
    id: string,
    updateAgentDto: UpdateAgentDto
  ): Promise<EnhancedAgentDto> {
    // Ensure agent exists
    await this.findOne(id);

    // Update the agent first
    const updatedAgent = await this.prisma.agent.update({
      where: { id },
      data: updateAgentDto,
      select: {
        id: true,
        workspaceId: true,
        name: true,
        behavior: true,
        avatar: true,
        communicationType: true,
        type: true,
        jobName: true,
        jobSite: true,
        jobDescription: true,
        isActive: true,

        channels: {
          select: {
            id: true,
            name: true,
            type: true,
            connected: true,
            config: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        intentions: {
          select: {
            id: true,
            toolName: true,
            description: true,
            type: true,
            httpMethod: true,
            url: true,
            requestBody: true,
            preprocessingMessage: true,
            preprocessingText: true,
            autoGenerateParams: true,
            autoGenerateBody: true,
            fields: {
              select: {
                id: true,
                name: true,
                jsonName: true,
                description: true,
                type: true,
                required: true,
              },
            },
            headers: {
              select: {
                id: true,
                name: true,
                value: true,
              },
            },
            params: {
              select: {
                id: true,
                name: true,
                value: true,
              },
            },
            preconditions: {
              select: {
                id: true,
                name: true,
                url: true,
                httpMethod: true,
                requestBody: true,
                failureCondition: true,
                failureMessage: true,
                successAction: true,
                headers: {
                  select: {
                    id: true,
                    name: true,
                    value: true,
                  },
                },
                queryParams: {
                  select: {
                    id: true,
                    name: true,
                    value: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Fetch the agent's settings
    const settings = await this.prisma.agentSettings.findUnique({
      where: { agentId: id },
      select: {
        preferredModel: true,
        timezone: true,
        enabledHumanTransfer: true,
        enabledReminder: true,
        reminderIntervalMinutes: true,
        splitMessages: true,
        enabledEmoji: true,
        limitSubjects: true,
        responseDelaySeconds: true,
      },
    });

    // Fetch the agent's webhooks
    const webhooks = await this.prisma.agentWebhooks.findUnique({
      where: { agentId: id },
      select: {
        onNewMessage: true,
        onLackKnowLedge: true,
        onTransfer: true,
        onFinishAttendance: true,
      },
    });

    // Fetch the agent's schedule settings
    const scheduleSettings = await this.prisma.scheduleSettings.findUnique({
      where: { agentId: id },
      select: {
        minAdvanceMinutes: true,
        maxAdvanceDays: true,
        maxEventDuration: true,
        alwaysOpen: true,
        availableTimes: true,
        askForContactName: true,
        askForContactPhone: true,
        askForMeetingDuration: true,
      },
    });

    // Fetch the agent's elevenLabs settings
    const elevenLabsSettings = await this.prisma.elevenLabsSettings.findUnique({
      where: { agentId: id },
      select: {
        respondAudioWithAudio: true,
        alwaysRespondWithAudio: true,
        stability: true,
        similarityBoost: true,
        selectedElevenLabsVoiceId: true,
        subscriptionTier: true,
        characterCount: true,
        characterLimit: true,
        userName: true,
      },
    });

    // Return the combined data as EnhancedAgentDto
    return {
      agent: updatedAgent,
      settings: settings || {
        preferredModel: AIModel.GPT_4_1,
        timezone: '(GMT+00:00) London',
        enabledHumanTransfer: true,
        enabledReminder: true,
        reminderIntervalMinutes: 10,
        splitMessages: true,
        enabledEmoji: true,
        limitSubjects: true,
        responseDelaySeconds: ResponseDelayOptions.FIVE_SECONDS,
        respondAudioWithAudio: false,
        alwaysRespondWithAudio: false,
      },
      webhooks: webhooks || {
        onNewMessage: null,
        onLackKnowLedge: null,
        onTransfer: null,
        onFinishAttendance: null,
      },
      scheduleSettings: {
        ...scheduleSettings,
        availableTimes: scheduleSettings.availableTimes as AvailableTimesDto,
      },
      elevenLabsSettings: {
        ...elevenLabsSettings,
      },
    };
  }

  async remove(
    id: string,
    asAdmin?: boolean
  ): Promise<{
    success: boolean;
    message?: string;
    deletedPermanently: boolean;
  }> {
    let deletedPermanently: boolean = false;
    try {
      if (asAdmin) {
        // Check if agent has been marked for deletion
        const agent = await this.prisma.agent.findUnique({
          where: { id, isDeleted: true },
        });

        if (agent) {
          const configsOfChannels = await this.prisma.channel.findMany({
            where: { agentId: id },
            select: {
              config: true,
            },
          });

          const wahaInstanceNames: string[] = [];

          for (const { config } of configsOfChannels) {
            if (
              typeof config === 'object' &&
              config !== null &&
              'wahaApi' in config
            ) {
              const confObj = config as Prisma.JsonObject;
              const wahaApi = confObj['wahaApi'];

              if (
                typeof wahaApi === 'object' &&
                wahaApi !== null &&
                'instanceName' in wahaApi
              ) {
                const instanceName = (wahaApi as Prisma.JsonObject)[
                  'instanceName'
                ];
                if (typeof instanceName === 'string') {
                  wahaInstanceNames.push(instanceName);
                }
              }
            }
          }

          for (const instanceName of wahaInstanceNames) {
            await this.wahaApiService.deleteInstance(instanceName);
          }

          // Actually delete from database
          await this.prisma.agent.delete({
            where: { id },
          });
          deletedPermanently = true;
        } else {
          // Mark as deleted
          await this.prisma.agent.update({
            where: { id },
            data: { isDeleted: true, isActive: false, updatedAt: new Date() },
          });

          const configsOfChannels = await this.prisma.channel.findMany({
            where: { agentId: id },
            select: {
              config: true,
            },
          });

          const wahaInstanceNames: string[] = [];

          for (const { config } of configsOfChannels) {
            if (
              typeof config === 'object' &&
              config !== null &&
              'wahaApi' in config
            ) {
              const confObj = config as Prisma.JsonObject;
              const wahaApi = confObj['wahaApi'];

              if (
                typeof wahaApi === 'object' &&
                wahaApi !== null &&
                'instanceName' in wahaApi
              ) {
                const instanceName = (wahaApi as Prisma.JsonObject)[
                  'instanceName'
                ];
                if (typeof instanceName === 'string') {
                  wahaInstanceNames.push(instanceName);
                }
              }
            }
          }

          for (const instanceName of wahaInstanceNames) {
            await this.wahaApiService.stopInstance(instanceName);
          }
        }
      } else {
        // Mark as deleted
        await this.prisma.agent.update({
          where: { id },
          data: { isDeleted: true, isActive: false, updatedAt: new Date() },
        });

        const configsOfChannels = await this.prisma.channel.findMany({
          where: { agentId: id },
          select: {
            config: true,
          },
        });

        const wahaInstanceNames: string[] = [];

        for (const { config } of configsOfChannels) {
          if (
            typeof config === 'object' &&
            config !== null &&
            'wahaApi' in config
          ) {
            const confObj = config as Prisma.JsonObject;
            const wahaApi = confObj['wahaApi'];

            if (
              typeof wahaApi === 'object' &&
              wahaApi !== null &&
              'instanceName' in wahaApi
            ) {
              const instanceName = (wahaApi as Prisma.JsonObject)[
                'instanceName'
              ];
              if (typeof instanceName === 'string') {
                wahaInstanceNames.push(instanceName);
              }
            }
          }
        }

        for (const instanceName of wahaInstanceNames) {
          await this.wahaApiService.stopInstance(instanceName);
        }
      }

      return {
        success: true,
        message: 'Agent deleted successfully',
        deletedPermanently,
      };
    } catch (error) {
      // Handle unexpected errors
      if (error.code === 'P2003') {
        // This is a Prisma foreign key constraint error
        const constraintMatch = error.message.match(/`([^`]+)`$/);
        const constraintName = constraintMatch ? constraintMatch[1] : 'unknown';

        return {
          success: false,
          message: `Cannot delete this agent because it is referenced by other records (constraint: ${constraintName}). You must delete the dependent records first.`,
          deletedPermanently: false,
        };
      }

      // Re-throw other errors to be handled by the global error handler
      throw error;
    }
  }

  async restore(id: string): Promise<{ success: boolean; message?: string }> {
    await this.prisma.agent.update({
      where: { id },
      data: { isDeleted: false, updatedAt: new Date() },
    });

    const configsOfChannels = await this.prisma.channel.findMany({
      where: { agentId: id },
      select: {
        config: true,
      },
    });

    const wahaInstanceNames: string[] = [];

    for (const { config } of configsOfChannels) {
      if (
        typeof config === 'object' &&
        config !== null &&
        'wahaApi' in config
      ) {
        const confObj = config as Prisma.JsonObject;
        const wahaApi = confObj['wahaApi'];

        if (
          typeof wahaApi === 'object' &&
          wahaApi !== null &&
          'instanceName' in wahaApi
        ) {
          const instanceName = (wahaApi as Prisma.JsonObject)['instanceName'];
          if (typeof instanceName === 'string') {
            wahaInstanceNames.push(instanceName);
          }
        }
      }
    }

    for (const instanceName of wahaInstanceNames) {
      await this.wahaApiService.startInstance(instanceName);
    }

    return { success: true, message: 'Agent restored successfully' };
  }

  async deactivate(id: string): Promise<{ success: boolean }> {
    await this.prisma.agent.update({
      where: { id },
      data: { isActive: false },
    });

    return { success: true };
  }

  async activate(id: string): Promise<{ success: boolean }> {
    await this.prisma.agent.update({
      where: { id },
      data: { isActive: true },
    });

    return { success: true };
  }
}
