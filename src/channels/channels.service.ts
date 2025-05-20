import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ChannelDto } from './dto/channel.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { Prisma } from '@prisma/client';
import { EvolutionApiService } from '../evolution-api/evolution-api.service';
import { ConfigService } from '@nestjs/config';
import { ChannelQrCodeDto } from './dto/channel-qr-code.dto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApiService: EvolutionApiService,
    private readonly configService: ConfigService
  ) {}

  async findAll(
    agentId: string,
    paginationDto: PaginationDto
  ): Promise<PaginatedResult<ChannelDto>> {
    const { page, pageSize, query } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Build search filter
    const whereClause: Prisma.ChannelWhereInput = {
      agentId,
      ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
    };

    // Count total matching records
    const total = await this.prisma.channel.count({
      where: whereClause,
    });

    // Query the data with pagination
    const channels = await this.prisma.channel.findMany({
      where: whereClause,
      skip,
      take: pageSize,
    });

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: channels.map((channel) => {
        const sanitizedConfig = this.sanitizeChannelConfig(
          channel.config as Record<string, any>
        );
        return {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          connected: channel.connected,
          config: sanitizedConfig,
        };
      }),
      meta: {
        total,
        page,
        pageSize,
        totalPages,
      },
    };
  }

  async create(
    agentId: string,
    createChannelDto: CreateChannelDto
  ): Promise<ChannelDto> {
    // First verify if the agent exists
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    let config = {};
    let connected = false;

    // If channel type is WHATSAPP, set up Evolution API from environment variables
    if (createChannelDto.type === 'WHATSAPP') {
      this.logger.log(
        `Creating WhatsApp channel for agent ${agentId} using Evolution API from environment variables`
      );

      // Get Evolution API credentials from environment variables
      const evolutionApiUrl = process.env.EVOLUTION_API_URL;
      const evolutionApiKey = process.env.EVOLUTION_API_KEY;

      if (!evolutionApiUrl || !evolutionApiKey) {
        throw new Error(
          'Missing EVOLUTION_API_URL or EVOLUTION_API_KEY environment variables'
        );
      }

      try {
        // Generate a unique instance name based on agent and timestamp
        const instanceName = `tawkee-agent-${agentId}-${Date.now()}`;

        // Construct the webhook URL for this channel
        const baseUrl = process.env.OUR_ADDRESS || 'http://localhost:5000';
        const webhookUrl = `${baseUrl}/webhooks/evolution`;

        this.logger.log(
          `Creating Evolution API instance with server URL: ${evolutionApiUrl}`
        );

        // Create the instance on the Evolution API
        const instanceResult = await this.evolutionApiService.createInstance({
          instanceName,
          serverUrl: evolutionApiUrl,
          apiKey: evolutionApiKey,
          webhookUrl,
        });

        this.logger.log(
          `Instance created: ${instanceName} with ID ${instanceResult.instance.instanceId}`
        );

        // Store the Evolution API configuration with enhanced information
        config = {
          evolutionApi: {
            instanceName,
            serverUrl: evolutionApiUrl,
            apiKey: evolutionApiKey,
            webhookToken: createChannelDto.webhookToken || '',
            webhookUrl,
            status: instanceResult.instance.status || 'connecting',
            qrCode: instanceResult.qrcode.base64,
            instanceId: instanceResult.instance?.instanceId || '', // Store the instanceId provided by Evolution API
            createdAt: new Date().toISOString(),
          },
        };

        // Mark as not fully connected yet (needs QR scan)
        connected = false;
      } catch (error) {
        this.logger.error(
          `Error creating WhatsApp instance: ${error.message}`,
          error.stack
        );

        // Store the basic configuration with error information
        config = {
          evolutionApi: {
            serverUrl: evolutionApiUrl,
            apiKey: evolutionApiKey,
            webhookToken: createChannelDto.webhookToken || '',
            error: error.message,
            createdAt: new Date().toISOString(),
          },
        };

        connected = false;
      }
    }

    // Create the channel
    const channel = await this.prisma.channel.create({
      data: {
        name: createChannelDto.name,
        type: createChannelDto.type,
        connected,
        config,
        agent: {
          connect: { id: agentId },
        },
      },
    });

    // Create a sanitized version of config that doesn't expose sensitive data
    const sanitizedConfig = this.sanitizeChannelConfig(
      channel.config as Record<string, any>
    );

    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      connected: channel.connected,
      config: sanitizedConfig,
    };
  }

  /**
   * Get WhatsApp connection QR code for a specific channel
   */
  async getWhatsAppQrCode(channelId: string): Promise<ChannelQrCodeDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.type !== 'WHATSAPP') {
      throw new Error(`Channel ${channelId} is not a WhatsApp channel`);
    }

    const config = channel.config as any;
    if (!config || !config.evolutionApi) {
      throw new Error(
        `Channel ${channelId} does not have Evolution API configuration`
      );
    }

    const { evolutionApi } = config;

    // Return the stored QR code and status from the channel configuration
    return {
      status: evolutionApi.status || 'unknown',
      instanceName: evolutionApi.instanceName,
      qrCode: evolutionApi.qrCode,
      pairingCode: evolutionApi.pairingCode,
      error: evolutionApi.error,
      updatedAt: evolutionApi.updatedAt || evolutionApi.createdAt,
    };
  }

  /**
   * Refresh WhatsApp QR code for a specific channel
   */
  async refreshWhatsAppQrCode(channelId: string): Promise<ChannelQrCodeDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.type !== 'WHATSAPP') {
      throw new Error(`Channel ${channelId} is not a WhatsApp channel`);
    }

    const config = channel.config as any;
    if (!config || !config.evolutionApi) {
      throw new Error(
        `Channel ${channelId} does not have Evolution API configuration`
      );
    }

    const { evolutionApi } = config;

    try {
      // First update the webhook URL to ensure it's using the correct URL and token
      try {
        this.logger.log(
          `Updating webhook URL for instance ${evolutionApi.instanceName}`
        );

        // Use the updated OUR_ADDRESS environment variable
        const baseUrl = process.env.OUR_ADDRESS || 'http://localhost:5000';
        const webhookUrl = `${baseUrl}/webhooks/evolution`;

        await this.evolutionApiService.updateInstanceWebhook(
          evolutionApi.instanceName,
          evolutionApi.serverUrl,
          evolutionApi.apiKey,
          webhookUrl
        );

        this.logger.log(`Webhook URL updated successfully to ${webhookUrl}`);

        // Update the webhook URL in the channel config
        evolutionApi.webhookUrl = webhookUrl;
        evolutionApi.webhookToken = process.env.WEBHOOK_TOKEN;
      } catch (error) {
        this.logger.warn(`Error updating webhook URL: ${error.message}`);
        // Continue with QR refresh even if webhook update fails
      }

      // Now fetch a fresh QR code from Evolution API
      this.logger.log(
        `Refreshing QR code for instance ${evolutionApi.instanceName}`
      );

      const qrResult = await this.evolutionApiService.getInstanceQR(
        evolutionApi.instanceName, // Use instanceName, not instanceId as per Evolution API docs
        evolutionApi.serverUrl,
        evolutionApi.apiKey
      );

      this.logger.log(
        `QR code refresh response structure: ${JSON.stringify(qrResult, null, 2)}`
      );

      if (!qrResult.qrcode) {
        this.logger.warn(
          `QR code not found in expected format during refresh, using fallback`
        );
      }

      // Create updated config with fresh QR code and webhook information
      const updatedConfig = {
        ...config,
        evolutionApi: {
          ...evolutionApi,
          qrCode: qrResult.qrcode?.base64 || null,
          pairingCode: qrResult.qrcode?.pairingCode || null,
          status: 'connecting',
          error: null,
          updatedAt: new Date().toISOString(),
          webhookUrl: process.env.OUR_ADDRESS + '/webhooks/evolution',
          webhookToken: process.env.WEBHOOK_TOKEN,
        },
      };

      // Update the channel with the fresh QR code
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          config: updatedConfig,
        },
      });

      // Return the fresh QR code info
      return {
        status: 'connecting',
        instanceName: evolutionApi.instanceName,
        qrCode: qrResult.qrcode?.base64 || null,
        pairingCode: qrResult.qrcode?.pairingCode || null,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error refreshing QR code: ${error.message}`,
        error.stack
      );

      // Update channel with error information
      const updatedConfig = {
        ...config,
        evolutionApi: {
          ...evolutionApi,
          status: 'error',
          error: error.message,
          updatedAt: new Date().toISOString(),
        },
      };

      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          config: updatedConfig,
        },
      });

      // Return error information
      return {
        status: 'error',
        instanceName: evolutionApi.instanceName,
        error: error.message,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Disconnect from WhatsApp without deleting the channel
   * This logs out from WhatsApp but keeps the channel configuration
   */
  async disconnectChannel(
    channelId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Find the channel
      const channel = await this.prisma.channel.findUnique({
        where: { id: channelId },
      });

      if (!channel) {
        throw new NotFoundException(`Channel with ID ${channelId} not found`);
      }

      if (channel.type !== 'WHATSAPP') {
        return {
          success: false,
          message: 'Cannot disconnect: This is not a WhatsApp channel',
        };
      }

      const channelConfig = channel.config as any;
      if (
        !channelConfig ||
        !channelConfig.evolutionApi ||
        !channelConfig.evolutionApi.instanceName
      ) {
        return {
          success: false,
          message: 'Cannot disconnect: Invalid channel configuration',
        };
      }

      // Extract the necessary configuration
      const { evolutionApi } = channelConfig;
      const instanceName = evolutionApi.instanceName;

      // Get Evolution API configuration from channel or environment
      let serverUrl = evolutionApi.serverUrl;
      let apiKey = evolutionApi.apiKey;

      // If not in channel config, try environment variables
      if (!serverUrl || !apiKey) {
        const evolutionApiUrl =
          this.configService.get<string>('EVOLUTION_API_URL');
        const evolutionApiKey =
          this.configService.get<string>('EVOLUTION_API_KEY');

        if (!evolutionApiUrl || !evolutionApiKey) {
          return {
            success: false,
            message: 'Evolution API configuration is missing',
          };
        }

        serverUrl = evolutionApiUrl;
        apiKey = evolutionApiKey;
      }

      this.logger.log(
        `Disconnecting WhatsApp for channel ${channelId} (instance: ${instanceName})`
      );

      // Logout from Evolution API instance
      const result = await this.evolutionApiService.logoutInstance({
        instanceName,
        serverUrl,
        apiKey,
      });

      if (result.success) {
        // Update channel status in database
        const updatedConfig = {
          ...channelConfig,
          evolutionApi: {
            ...evolutionApi,
            connected: false,
            status: 'close',
            disconnectedAt: new Date().toISOString(),
          },
        };

        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            config: updatedConfig,
            connected: false,
            updatedAt: new Date(),
          },
        });

        return {
          success: true,
          message:
            'WhatsApp disconnected successfully. You can scan the QR code again to reconnect.',
        };
      } else {
        this.logger.warn(`Failed to disconnect WhatsApp: ${result.message}`);
        return {
          success: false,
          message: result.message || 'Failed to disconnect from WhatsApp',
        };
      }
    } catch (error) {
      this.logger.error(
        `Error disconnecting WhatsApp for channel ${channelId}: ${error.message}`,
        error.stack
      );
      return {
        success: false,
        message: `Error disconnecting: ${error.message}`,
      };
    }
  }

  /**
   * Delete a channel and potentially its Evolution API instance if no other channels are using it
   */
  async deleteChannel(channelId: string): Promise<{ success: boolean }> {
    // Start a transaction to ensure data consistency
    return this.prisma.$transaction(async (prisma) => {
      // Find the channel
      const channel = await prisma.channel.findUnique({
        where: { id: channelId },
      });

      if (!channel) {
        throw new NotFoundException(`Channel with ID ${channelId} not found`);
      }

      this.logger.log(`Deleting channel ${channelId} of type ${channel.type}`);

      // Check if it's a WhatsApp channel with Evolution API configuration
      if (channel.type === 'WHATSAPP') {
        const config = channel.config as any;

        if (config && config.evolutionApi && config.evolutionApi.instanceName) {
          const { evolutionApi } = config;
          const instanceName = evolutionApi.instanceName;

          this.logger.log(
            `Channel uses Evolution API instance ${instanceName}`
          );

          // Check if there are other channels using the same Evolution API instance
          const otherChannelsCount = await prisma.channel.count({
            where: {
              id: { not: channelId },
              type: 'WHATSAPP',
              config: {
                path: ['evolutionApi', 'instanceName'],
                equals: instanceName,
              },
            },
          });

          // If no other channels are using this Evolution API instance, delete it
          if (otherChannelsCount === 0) {
            this.logger.log(
              `No other channels using instance ${instanceName}, deleting it`
            );

            try {
              await this.evolutionApiService.deleteInstance({
                instanceName,
                serverUrl: evolutionApi.serverUrl,
                apiKey: evolutionApi.apiKey,
              });

              this.logger.log(
                `Evolution API instance ${instanceName} deleted successfully`
              );
            } catch (error) {
              this.logger.error(
                `Error deleting Evolution API instance: ${error.message}`,
                error.stack
              );
              // Continue with channel deletion even if Evolution API instance deletion fails
            }
          } else {
            this.logger.log(
              `Found ${otherChannelsCount} other channels using instance ${instanceName}, not deleting it`
            );
          }
        }
      }

      // Delete the channel
      await prisma.channel.delete({
        where: { id: channelId },
      });

      return { success: true };
    });
  }

  /**
   * Sanitize channel config to remove sensitive data before returning to clients
   */
  private sanitizeChannelConfig(
    config: Record<string, any>
  ): Record<string, any> {
    if (!config) return {};

    const sanitizedConfig = { ...config };

    // If there's Evolution API config, sanitize it
    if (sanitizedConfig.evolutionApi) {
      // Create a sanitized version of Evolution API config with only safe fields
      sanitizedConfig.evolutionApi = {
        instanceName: config.evolutionApi.instanceName,
        status: config.evolutionApi.status,
        connected: config.evolutionApi.connected,
        createdAt: config.evolutionApi.createdAt,
        updatedAt: config.evolutionApi.updatedAt,
      };

      // Include QR code if it exists (safe to include)
      if (sanitizedConfig.evolutionApi.qrCode) {
        sanitizedConfig.evolutionApi.qrCode = config.evolutionApi.qrCode;
      }

      // Include error message if exists
      if (sanitizedConfig.evolutionApi.error) {
        sanitizedConfig.evolutionApi.error = config.evolutionApi.error;
      }
    }

    return sanitizedConfig;
  }
}
