import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ChannelDto } from './dto/channel.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { Prisma } from '@prisma/client';
import { WahaApiService } from '../waha-api/waha-api.service';
import { ConfigService } from '@nestjs/config';
import { ChannelQrCodeDto } from './dto/channel-qr-code.dto';
import { WebsocketService } from 'src/websocket/websocket.service';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaApiService: WahaApiService,
    private readonly configService: ConfigService,
    private readonly websocketService: WebsocketService
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
      where: { id: agentId, isDeleted: false },
    });

    if (!agent) {
      throw new NotFoundException(`Agent with ID ${agentId} not found`);
    }

    let config = {};
    let connected = false;

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

    // If channel type is WHATSAPP, set up Waha API from environment variables
    if (createChannelDto.type === 'WHATSAPP') {
      this.logger.log(
        `Creating WhatsApp channel for agent ${agentId} using Waha API from environment variables`
      );

      // Get Waha API credentials from environment variables
      const wahaApiUrl = process.env.WAHA_API_URL;
      const wahaApiKey = process.env.WAHA_API_KEY;

      if (!wahaApiUrl || !wahaApiKey) {
        throw new Error(
          'Missing WAHA_API_URL or WAHA_API_KEY environment variables'
        );
      }

      // Generate a unique instance name based on agent and timestamp
      // const instanceName = 'default';
      const instanceName = `TA-${channel.id}`;

      try {
        // Construct the webhook URL for this channel
        const baseUrl = process.env.OUR_ADDRESS || 'http://localhost:5000';
        const webhookUrl = `${baseUrl}/webhooks/waha`;

        this.logger.log(
          `Creating Waha API instance with server URL: ${wahaApiUrl}`
        );

        // Create the instance on the Waha API
        const instanceResult = await this.wahaApiService.createInstance({
          workspaceId: agent.workspaceId,
          agentId,
          channelId: channel.id,
          instanceName,
          serverUrl: wahaApiUrl,
          apiKey: wahaApiKey,
          webhookUrl,
        });

        this.logger.log(JSON.stringify(instanceResult, null, 4));

        // Store the Waha API configuration with enhanced information
        config = {
          wahaApi: {
            instanceName,
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
          wahaApi: {
            instanceName,
            createdAt: new Date().toISOString(),
            error: error.message,
          },
        };

        connected = false;
      }
    }

    // Update the channel with config
    const updatedChannel = await this.prisma.channel.update({
      where: {
        id: channel.id,
      },
      data: {
        config,
      },
    });

    console.log(config);
    console.log(updatedChannel);

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
   * Refresh WhatsApp QR code for a specific channel
   */
  async refreshWhatsAppQrCode(channelId: string): Promise<ChannelQrCodeDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        type: true,
        config: true,
        agent: {
          select: {
            id: true,
            workspaceId: true
          }
        }
      }
    });

    if (!channel) {
      throw new NotFoundException(`Channel with ID ${channelId} not found`);
    }

    if (channel.type !== 'WHATSAPP') {
      throw new Error(`Channel ${channelId} is not a WhatsApp channel`);
    }

    const config = channel.config as any;
    if (!config || !config.wahaApi) {
      throw new Error(
        `Channel ${channelId} does not have Waha API configuration`
      );
    }

    const { wahaApi } = config;

    try {
      const wahaApiUrl = process.env.WAHA_API_URL;
      const wahaApiKey = process.env.WAHA_API_KEY;

      // Check session status first, and only attempt to fetch QR Code if it's SCAN_QR_CODE
      const instanceInfo = await this.wahaApiService.getInstance(
        wahaApi.instanceName, wahaApiUrl, wahaApiKey
      );

      if (instanceInfo.status === 'WORKING') {
        // Update channel status connection right away

        await this.prisma.channel.update({
          where: { id: channelId },
          data: {
            connected: true,
            // Store the connection details in the config JSON
            config: {
              ...config,
              wahaApi: {
                ...wahaApi,
                status: 'WORKING', // Update the status in wahaApi config
              },
              connectionStatus: {
                state: 'WORKING',
                updatedAt: new Date().toISOString(),
              },
            },
          },
        });

        this.logger.log(
          `Updated channel ${channelId} connection status to: connected'}`
        );

        this.websocketService.sendToClient(
          channel.agent.workspaceId,
          'channelConnectionStatusUpdate',
          {
            agentId: channel.agent.id,
            channelId: channel.id,
            connectionStatus: 'WORKING',
          }
        );

        return;
        
      } else if (instanceInfo.status !== 'SCAN_QR_CODE') {
        throw new UnauthorizedException(`Channel is in status ${instanceInfo.status} and is not expecting connections.`);
      }

      // Now fetch a fresh QR code from Waha API
      this.logger.log(
        `Refreshing QR code for instance ${wahaApi.instanceName}`
      );

      const qrResult = await this.wahaApiService.getInstanceQR(
        channel.id,
        wahaApi.instanceName, // Use instanceName, not instanceId as per Waha API docs
        wahaApiUrl,
        wahaApiKey
      );

      this.logger.log(
        `QR code refresh response structure: ${JSON.stringify(qrResult, null, 2)}`
      );

      if (!qrResult.value) {
        this.logger.warn(
          `QR code not found in expected format during refresh, using fallback`
        );
      }

      // Return the fresh QR code info
      return {
        instanceName: wahaApi.instanceName,
        status: 'SCAN_QR_CODE',
        qrCode: qrResult.value || null,
      };
    } catch (error) {
      this.logger.error(
        `Error refreshing QR code: ${error.message}`,
        error.stack
      );

      // Update channel with error information
      const updatedConfig = {
        ...config,
        wahaApi: {
          ...wahaApi,
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

      // Throw error information
      throw error;
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
        !channelConfig.wahaApi ||
        !channelConfig.wahaApi.instanceName
      ) {
        return {
          success: false,
          message: 'Cannot disconnect: Invalid channel configuration',
        };
      }

      // Extract the necessary configuration
      const { wahaApi } = channelConfig;
      const instanceName = wahaApi.instanceName;

      // Get Waha API configuration from channel or environment
      let serverUrl = wahaApi.serverUrl;
      let apiKey = wahaApi.apiKey;

      // If not in channel config, try environment variables
      if (!serverUrl || !apiKey) {
        const wahaApiUrl = this.configService.get<string>('EVOLUTION_API_URL');
        const wahaApiKey = this.configService.get<string>('EVOLUTION_API_KEY');

        if (!wahaApiUrl || !wahaApiKey) {
          return {
            success: false,
            message: 'Waha API configuration is missing',
          };
        }

        serverUrl = wahaApiUrl;
        apiKey = wahaApiKey;
      }

      this.logger.log(
        `Disconnecting WhatsApp for channel ${channelId} (instance: ${instanceName})`
      );

      // Logout from Waha API instance
      const result = await this.wahaApiService.logoutInstance({
        instanceName,
        serverUrl,
        apiKey,
      });

      if (result.success) {
        // Update channel status in database
        const updatedConfig = {
          ...channelConfig,
          wahaApi: {
            ...wahaApi,
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
   * Delete a channel and potentially its Waha API instance if no other channels are using it
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

      // Check if it's a WhatsApp channel with Waha API configuration
      if (channel.type === 'WHATSAPP') {
        const config = channel.config as any;

        if (config && config.evolutionApi && config.evolutionApi.instanceName) {
          const { evolutionApi } = config;
          const instanceName = evolutionApi.instanceName;

          this.logger.log(`Channel uses Waha API instance ${instanceName}`);

          // Check if there are other channels using the same Waha API instance
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

          // If no other channels are using this Waha API instance, delete it
          if (otherChannelsCount === 0) {
            this.logger.log(
              `No other channels using instance ${instanceName}, deleting it`
            );

            try {
              await this.wahaApiService.deleteInstance(instanceName);

              this.logger.log(
                `Waha API instance ${instanceName} deleted successfully`
              );
            } catch (error) {
              this.logger.error(
                `Error deleting Waha API instance: ${error.message}`,
                error.stack
              );
              // Continue with channel deletion even if Waha API instance deletion fails
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

    // If there's Waha API config, sanitize it
    if (sanitizedConfig.evolutionApi) {
      // Create a sanitized version of Waha API config with only safe fields
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
