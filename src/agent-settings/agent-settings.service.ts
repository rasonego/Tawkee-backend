import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { AgentSettingsDto } from './dto/agent-settings.dto';
import {
  PrismaClientKnownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
} from '@prisma/client/runtime/library';

@Injectable()
export class AgentSettingsService {
  private readonly logger = new Logger(AgentSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService
  ) {}

  async getSettings(agentId: string): Promise<AgentSettingsDto> {
    try {
      // Ensure agent exists
      await this.agentsService.findOne(agentId);

      const settings = await this.prisma.agentSettings.findUnique({
        where: { agentId },
      });

      if (!settings) {
        // Create default settings if they don't exist
        return this.createDefaultSettings(agentId);
      }

      return {
        preferredModel: settings.preferredModel,
        timezone: settings.timezone,
        enabledHumanTransfer: settings.enabledHumanTransfer,
        enabledReminder: settings.enabledReminder,
        splitMessages: settings.splitMessages,
        enabledEmoji: settings.enabledEmoji,
        limitSubjects: settings.limitSubjects,
        messageGroupingTime: settings.messageGroupingTime,
      };
    } catch (error) {
      this.logger.error(
        `Error getting agent settings: ${error.message}`,
        error.stack
      );

      // Handle specific database connection errors
      if (
        error instanceof PrismaClientKnownRequestError ||
        error instanceof PrismaClientRustPanicError ||
        error instanceof PrismaClientInitializationError
      ) {
        // Check if it's a connection error
        if (
          error.message.includes("Can't reach database server") ||
          error.message.includes('Unable to start a transaction') ||
          error.message.includes('Connection refused')
        ) {
          throw new InternalServerErrorException({
            success: false,
            message: 'Database connection error. Please try again later.',
            error: 'DATABASE_CONNECTION_ERROR',
          });
        }
      }

      // Re-throw the error to be caught by the global exception filter
      throw error;
    }
  }

  async updateSettings(
    agentId: string,
    agentSettingsDto: AgentSettingsDto
  ): Promise<{ updatedSettingsDto: AgentSettingsDto }> {
    try {
      // Update existing settings
      const updatedSettingsDto = await this.prisma.agentSettings.update({
        where: { agentId },
        data: agentSettingsDto,
      });

      return { updatedSettingsDto };
    } catch (error) {
      this.logger.error(
        `Error updating agent settings: ${error.message}`,
        error.stack
      );

      // Handle specific database connection errors
      if (
        error instanceof PrismaClientKnownRequestError ||
        error instanceof PrismaClientRustPanicError ||
        error instanceof PrismaClientInitializationError
      ) {
        // Check if it's a connection error
        if (
          error.message.includes("Can't reach database server") ||
          error.message.includes('Unable to start a transaction') ||
          error.message.includes('Connection refused')
        ) {
          throw new InternalServerErrorException({
            success: false,
            message: 'Database connection error. Please try again later.',
            error: 'DATABASE_CONNECTION_ERROR',
          });
        }
      }

      // Re-throw the error to be caught by the global exception filter
      throw error;
    }
  }

  private async createDefaultSettings(
    agentId: string
  ): Promise<AgentSettingsDto> {
    try {
      const defaultSettings: AgentSettingsDto = {
        preferredModel: 'GPT_4_1',
        timezone: '(GMT+00:00) London',
        enabledHumanTransfer: true,
        enabledReminder: true,
        splitMessages: true,
        enabledEmoji: true,
        limitSubjects: true,
        messageGroupingTime: 'NO_GROUP',
      };

      await this.prisma.agentSettings.create({
        data: {
          ...defaultSettings,
          agentId,
        },
      });

      return defaultSettings;
    } catch (error) {
      this.logger.error(
        `Error creating default settings: ${error.message}`,
        error.stack
      );

      // Handle specific database connection errors
      if (
        error instanceof PrismaClientKnownRequestError ||
        error instanceof PrismaClientRustPanicError ||
        error instanceof PrismaClientInitializationError
      ) {
        // Check if it's a connection error
        if (
          error.message.includes("Can't reach database server") ||
          error.message.includes('Unable to start a transaction') ||
          error.message.includes('Connection refused')
        ) {
          throw new InternalServerErrorException({
            success: false,
            message: 'Database connection error. Please try again later.',
            error: 'DATABASE_CONNECTION_ERROR',
          });
        }
      }

      // Re-throw the error
      throw error;
    }
  }
}
