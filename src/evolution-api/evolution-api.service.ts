import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

interface CreateInstanceOptions {
  instanceName: string;
  serverUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

interface SendTextMessageOptions {
  phoneNumber: string;
  message: string;
  instanceName: string; // Primary identifier for Evolution API
  serverUrl: string;
  apiKey: string;
  instanceId?: string; // Made optional as we're using instanceName
}

interface SendMediaMessageOptions {
  phoneNumber: string;
  mediaUrl: string;
  caption?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  fileName?: string;
  instanceName: string; // Primary identifier for Evolution API
  serverUrl: string;
  apiKey: string;
  instanceId?: string; // Made optional as we're using instanceName
}

@Injectable()
export class EvolutionApiService {
  private readonly logger = new Logger(EvolutionApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Evolution API configuration from environment variables
   * @returns {Object} Object containing server URL and API key
   */
  getEvolutionApiConfig() {
    const serverUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!serverUrl || !apiKey) {
      throw new Error(
        'Missing EVOLUTION_API_URL or EVOLUTION_API_KEY environment variables'
      );
    }

    return { serverUrl, apiKey };
  }

  /**
   * Send a text message through Evolution API
   */
  async sendTextMessage(options: SendTextMessageOptions): Promise<any> {
    try {
      const { phoneNumber, message, instanceName, serverUrl, apiKey } = options;

      // Ensure phone number is properly formatted - remove any non-numeric characters except +
      const formattedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // If phone number doesn't start with +, ensure it doesn't start with a leading 0
      const finalPhoneNumber = formattedPhone.startsWith('+')
        ? formattedPhone.substring(1) // Evolution API doesn't want the + prefix
        : formattedPhone.replace(/^0/, ''); // Remove leading 0 if present

      this.logger.log(
        `Sending message to ${finalPhoneNumber} using instance ${instanceName}`
      );
      // According to Evolution API docs, use instanceName instead of instanceId
      const payload = {
        number: finalPhoneNumber,
        text: message,
        delay: 1000, // 1 second delay
      };

      this.logger.debug(`Sending with payload: ${JSON.stringify(payload)}`);

      const response = await axios.post(
        `${serverUrl}/message/sendText/${instanceName}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      // Evolution API might return 200 or 201, and the success flag might be missing
      // but we'll always get a valid response with message details when successful
      if (
        (response.status === 200 || response.status === 201) &&
        response.data.key
      ) {
        this.logger.log(`Message sent successfully to ${finalPhoneNumber}`);
        return response.data;
      } else {
        // Log the issue but don't throw an error since the message might have been sent
        this.logger.warn(
          `Unexpected response from Evolution API: ${JSON.stringify(response.data)}`
        );
        return response.data; // Return the data anyway so the caller can decide what to do
      }
    } catch (error) {
      // Specific error handling for common API errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        this.logger.error(
          `Evolution API error: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
        );

        // Check for specific error codes and provide more helpful messages
        if (error.response.status === 401) {
          return {
            success: false,
            error: 'Authentication failed. Check your API key.',
          };
        } else if (error.response.status === 404) {
          return {
            success: false,
            error:
              'Instance not found. It may have been deleted or not created correctly.',
          };
        } else if (error.response.status === 410) {
          return {
            success: false,
            error:
              'WhatsApp session is not active. The QR code may need to be rescanned.',
          };
        } else if (error.response.status === 500) {
          return {
            success: false,
            error:
              'Server error from Evolution API. The instance may not be connected properly.',
            details: error.response.data,
          };
        }
      } else if (error.request) {
        // The request was made but no response was received
        this.logger.error(`Evolution API no response: ${error.message}`);
        return {
          success: false,
          error:
            'No response from Evolution API server. Check your server URL and network connection.',
        };
      }

      // Generic error logging
      this.logger.error(`Error sending message: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a media message through Evolution API
   */
  async sendMediaMessage(options: SendMediaMessageOptions): Promise<any> {
    try {
      const {
        phoneNumber,
        mediaUrl,
        caption,
        mediaType,
        fileName,
        instanceName,
        serverUrl,
        apiKey,
      } = options;

      // Ensure phone number is properly formatted - remove any non-numeric characters except +
      const formattedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // If phone number doesn't start with +, ensure it doesn't start with a leading 0
      const finalPhoneNumber = formattedPhone.startsWith('+')
        ? formattedPhone.substring(1) // Evolution API doesn't want the + prefix
        : formattedPhone.replace(/^0/, ''); // Remove leading 0 if present

      this.logger.log(
        `Sending ${mediaType} to ${finalPhoneNumber} using instance ${instanceName}`
      );

      // Check instance status before attempting to send media
      try {
        const instanceStatus = await axios.get(
          `${serverUrl}/instance/connectionState/${instanceName}`,
          {
            headers: {
              'Content-Type': 'application/json',
              apikey: apiKey,
            },
          }
        );

        // Log the connection state
        const state = instanceStatus?.data?.state || 'unknown';
        const connected = state === 'open' || state === 'connected';
        this.logger.log(
          `Instance ${instanceName} connection state: ${state}, connected: ${connected}`
        );

        if (!connected) {
          this.logger.warn(
            `Cannot send media: WhatsApp instance ${instanceName} is not connected (state: ${state})`
          );
          return {
            success: false,
            error: `WhatsApp instance is not connected (state: ${state})`,
            state: state,
          };
        }
      } catch (statusError) {
        this.logger.warn(
          `Failed to check instance state: ${statusError.message}`
        );
        // Continue anyway since the instance might still be connected
      }

      let endpoint;
      const payload: any = {
        number: finalPhoneNumber,
        options: {
          delay: 1000,
          presence: 'composing', // Show "typing" indicator
        },
      };

      switch (mediaType) {
        case 'image':
          endpoint = 'sendImage';
          payload.imageMessage = {
            image: mediaUrl,
            caption: caption || '',
          };
          break;
        case 'video':
          endpoint = 'sendVideo';
          payload.videoMessage = {
            video: mediaUrl,
            caption: caption || '',
          };
          break;
        case 'audio':
          endpoint = 'sendAudio';
          payload.audioMessage = {
            audio: mediaUrl,
          };
          break;
        case 'document':
          endpoint = 'sendDocument';
          payload.documentMessage = {
            document: mediaUrl,
            fileName: fileName || 'document',
            caption: caption || '',
          };
          break;
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      this.logger.debug(
        `Sending media with payload: ${JSON.stringify(payload)}`
      );

      // According to Evolution API docs, use instanceName instead of instanceId
      const response = await axios.post(
        `${serverUrl}/message/${endpoint}/${instanceName}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          timeout: 15000, // 15 second timeout for media (larger than text timeout)
        }
      );

      // Apply the same improved validation logic as for text messages
      if (
        (response.status === 200 || response.status === 201) &&
        (response.data.success === true || response.data.key)
      ) {
        this.logger.log(`Media sent successfully to ${finalPhoneNumber}`);
        return response.data;
      } else {
        // Log the issue but don't throw an error since the media might have been sent
        this.logger.warn(
          `Unexpected response from Evolution API for media: ${JSON.stringify(response.data)}`
        );
        return response.data; // Return the data anyway so the caller can decide what to do
      }
    } catch (error) {
      // Specific error handling for common API errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        this.logger.error(
          `Evolution API error (media): Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
        );

        // Check for specific error codes and provide more helpful messages
        if (error.response.status === 401) {
          return {
            success: false,
            error: 'Authentication failed. Check your API key.',
          };
        } else if (error.response.status === 404) {
          return {
            success: false,
            error:
              'Instance not found. It may have been deleted or not created correctly.',
          };
        } else if (error.response.status === 410) {
          return {
            success: false,
            error:
              'WhatsApp session is not active. The QR code may need to be rescanned.',
          };
        } else if (error.response.status === 500) {
          return {
            success: false,
            error:
              'Server error from Evolution API. The instance may not be connected properly or media URL is invalid.',
            details: error.response.data,
          };
        }
      } else if (error.request) {
        // The request was made but no response was received
        this.logger.error(
          `Evolution API no response (media): ${error.message}`
        );
        return {
          success: false,
          error:
            'No response from Evolution API server. Check your server URL and network connection.',
        };
      }

      // Generic error logging
      this.logger.error(`Error sending media: ${error.message}`, error.stack);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get channel configuration for Evolution API
   */
  async getChannelConfig(channelId: string): Promise<{
    instanceName: string;
    serverUrl: string;
    apiKey: string;
    instanceId?: string; // Now optional
  } | null> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      return null;
    }

    const config = channel.config as any;

    // If channel doesn't have instance name, return null
    if (
      !config ||
      !config.evolutionApi ||
      (!config.evolutionApi.instanceName && !config.evolutionApi.instanceId)
    ) {
      return null;
    }

    try {
      // Get server URL and API key from environment vars if not in config
      const { serverUrl, apiKey } = this.getEvolutionApiConfig();

      return {
        instanceId: config.evolutionApi.instanceId,
        instanceName:
          config.evolutionApi.instanceName || config.evolutionApi.instanceId, // Use instanceName if available, fallback to instanceId
        // Use values from config if they exist, otherwise fall back to environment variables
        serverUrl: config.evolutionApi.serverUrl || serverUrl,
        apiKey: config.evolutionApi.apiKey || apiKey,
      };
    } catch (error) {
      this.logger.error(`Error getting Evolution API config: ${error.message}`);

      // If config has all the required values, return them even if env vars are missing
      if (
        config.evolutionApi.serverUrl &&
        config.evolutionApi.apiKey &&
        (config.evolutionApi.instanceName || config.evolutionApi.instanceId)
      ) {
        return {
          instanceId: config.evolutionApi.instanceId,
          instanceName:
            config.evolutionApi.instanceName || config.evolutionApi.instanceId,
          serverUrl: config.evolutionApi.serverUrl,
          apiKey: config.evolutionApi.apiKey,
        };
      }

      return null;
    }
  }

  /**
   * Create a new instance on Evolution API
   */
  async createInstance(options: CreateInstanceOptions): Promise<any> {
    try {
      const { instanceName, serverUrl, apiKey, webhookUrl } = options;

      this.logger.log(
        `Creating instance ${instanceName} on Evolution API at ${serverUrl} with apiKey ${apiKey} and webhookUrl ${webhookUrl}`
      );

      // First, check if the instance already exists
      try {
        const response = await axios.get(
          `${serverUrl}/instance/fetchInstances`,
          {
            headers: {
              'Content-Type': 'application/json',
              apikey: apiKey,
            },
          }
        );

        // If the instance already exists, return it
        if (
          response.data &&
          response.data.data &&
          Array.isArray(response.data.data)
        ) {
          const existingInstance = response.data.data.find(
            (inst: any) => inst.instance?.instanceName === instanceName
          );

          if (existingInstance) {
            this.logger.log(
              `Instance ${instanceName} already exists, using existing instance`
            );

            return existingInstance;
          }
        }
      } catch (error) {
        // If there's an error checking instances, continue with creation
        this.logger.warn(`Error checking existing instances: ${error.message}`);
      }

      // Create the instance
      const createResponse = await axios.post(
        `${serverUrl}/instance/create`,
        {
          instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: webhookUrl
            ? {
                url: webhookUrl,
                enabled: true,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${process.env.WEBHOOK_TOKEN}`,
                },
                events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
              }
            : undefined,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
        }
      );

      if (createResponse.status === 201 || createResponse.status === 200) {
        this.logger.log(`Instance ${instanceName} created successfully`);
        return createResponse.data;
      } else {
        throw new Error(
          `Failed to create instance: ${JSON.stringify(createResponse.data)}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error creating instance: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Set webhook URL for an instance
   */
  private async setInstanceWebhook(options: {
    instanceName: string; // Changed from instanceId to instanceName for clarity
    serverUrl: string;
    apiKey: string;
    webhookUrl: string;
  }): Promise<any> {
    try {
      const { instanceName, serverUrl, apiKey, webhookUrl } = options;

      this.logger.log(
        `Setting webhook URL for instance ${instanceName} to ${webhookUrl}`
      );

      // According to Evolution API docs, the endpoint is /webhook/set/{instanceName}
      const response = await axios.post(
        `${serverUrl}/webhook/set/${instanceName}`,
        {
          webhook: {
            enabled: true,
            url: webhookUrl,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.WEBHOOK_TOKEN}`,
            },
            events: ['CONNECTION_UPDATE', 'MESSAGES_UPSERT'],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
        }
      );

      if (response.status === 200 && response.data.success) {
        this.logger.log(
          `Webhook URL set successfully for instance ${instanceName}`
        );
        return response.data;
      } else {
        throw new Error(
          `Failed to set webhook URL: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error setting webhook URL: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get QR code for instance connection
   */
  async getInstanceQR(
    instanceName: string,
    serverUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      this.logger.log(`Getting QR code for instance ${instanceName}`);

      // According to Evolution API docs, use the instance name here (not instance ID)
      const response = await axios.get(
        `${serverUrl}/instance/connect/${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
        }
      );

      if (response.status === 200) {
        this.logger.log(
          `QR response received for instance ${instanceName}: ${JSON.stringify(response.data)}`
        );

        // The Evolution API can return various response formats
        // Let's handle different structures carefully
        const responseData = {
          qrcode: {
            base64: null,
            pairingCode: null,
          },
          ...response.data,
        };

        // If we have direct base64 in the response
        if (response.data.base64) {
          responseData.qrcode = {
            base64: response.data.base64,
            pairingCode: response.data.pairingCode || null,
          };
          this.logger.log(
            `QR code retrieved successfully for instance ${instanceName}`
          );
        }
        // If QR is nested under qrcode object
        else if (response.data.qrcode && response.data.qrcode.base64) {
          responseData.qrcode = response.data.qrcode;
          this.logger.log(
            `QR code retrieved successfully from qrcode object for instance ${instanceName}`
          );
        }
        // If QR is in a different format
        else if (response.data.data && response.data.data.qrcode) {
          responseData.qrcode = {
            base64: response.data.data.qrcode,
            pairingCode: response.data.data.pairingCode || null,
          };
          this.logger.log(
            `QR code retrieved from data.qrcode for instance ${instanceName}`
          );
        }

        return responseData;
      } else {
        throw new Error(
          `Failed to get QR code: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.logger.error(`Error getting QR code: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Logout from WhatsApp on an Evolution API instance without deleting the instance
   */
  async logoutInstance(options: {
    instanceName: string;
    serverUrl: string;
    apiKey: string;
  }): Promise<any> {
    try {
      const { instanceName, serverUrl, apiKey } = options;

      this.logger.log(
        `Logging out WhatsApp session for instance ${instanceName}`
      );

      // According to Evolution API docs, use logout endpoint with instance name
      const response = await axios.delete(
        `${serverUrl}/instance/logout/${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          timeout: 10000, // 10 second timeout
        }
      );

      if (response.status === 200) {
        this.logger.log(
          `WhatsApp logout successful for instance ${instanceName}`
        );
        return {
          success: true,
          message: 'WhatsApp session logged out successfully',
          data: response.data,
        };
      } else {
        this.logger.warn(
          `Unexpected response from logout: ${JSON.stringify(response.data)}`
        );
        return {
          success: false,
          message: 'Unexpected response from Evolution API',
          data: response.data,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error logging out from WhatsApp: ${error.message}`,
        error.stack
      );

      // Return structured error instead of throwing
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        return {
          success: false,
          message: `Logout failed: ${error.response.status} - ${error.message}`,
          data: error.response.data,
        };
      } else if (error.request) {
        // The request was made but no response was received
        return {
          success: false,
          message: 'No response from Evolution API server',
          error: error.message,
        };
      } else {
        // Something happened in setting up the request
        return {
          success: false,
          message: 'Error preparing logout request',
          error: error.message,
        };
      }
    }
  }

  /**
   * Delete an Evolution API instance
   */
  async deleteInstance(options: {
    instanceName: string;
    serverUrl: string;
    apiKey: string;
  }): Promise<any> {
    try {
      const { instanceName, serverUrl, apiKey } = options;

      this.logger.log(`Deleting instance ${instanceName} from Evolution API`);

      // According to Evolution API docs, use the instance name here (not instance ID)
      const response = await axios.delete(
        `${serverUrl}/instance/delete/${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
        }
      );

      if (response.status === 200 && response.data.success) {
        this.logger.log(`Instance ${instanceName} deleted successfully`);
        return response.data;
      } else {
        throw new Error(
          `Failed to delete instance: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error deleting instance: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Update webhook URL for an existing instance
   * Public wrapper for the private setInstanceWebhook method
   */
  async updateInstanceWebhook(
    instanceName: string,
    serverUrl: string,
    apiKey: string,
    webhookUrl: string
  ): Promise<any> {
    return this.setInstanceWebhook({
      instanceName,
      serverUrl,
      apiKey,
      webhookUrl,
    });
  }

  async sendWhatsAppMessage(
    agentId: string,
    phoneNumber: string,
    message: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'video' | 'audio' | 'document',
    caption?: string,
    fileName?: string
  ): Promise<any> {
    // Find the first WhatsApp channel for this agent
    const channel = await this.prisma.channel.findFirst({
      where: {
        agentId,
        type: 'WHATSAPP',
      },
    });

    if (!channel) {
      throw new Error(`No WhatsApp channel found for agent ${agentId}`);
    }

    try {
      // Try to get channel config first
      let config = await this.getChannelConfig(channel.id);

      // If no config found but we have environment variables, create a minimal config using env vars
      if (!config) {
        this.logger.warn(
          `No Evolution API config found for channel ${channel.id}, trying to use environment variables`
        );

        try {
          const { serverUrl, apiKey } = this.getEvolutionApiConfig();

          if (
            !channel.config ||
            !channel.config['evolutionApi'] ||
            !channel.config['evolutionApi']['instanceName']
          ) {
            throw new Error(
              'Missing Evolution API instance name in channel config'
            );
          }

          // Extract just the instanceName from channel config
          const instanceName = channel.config['evolutionApi']['instanceName'];

          this.logger.log(
            `Using environment variables with instance ${instanceName} to send WhatsApp message`
          );

          config = {
            instanceName,
            serverUrl,
            apiKey,
          };
        } catch (error) {
          this.logger.error(
            `Failed to get Evolution API config from environment: ${error.message}`
          );
          throw new Error(
            `No Evolution API configuration available for channel ${channel.id}`
          );
        }
      }

      // Format phone number (remove leading + if present)
      const formattedPhone = phoneNumber.startsWith('+')
        ? phoneNumber.substring(1)
        : phoneNumber;

      this.logger.log(
        `Sending ${mediaUrl ? 'media' : 'text'} message to ${formattedPhone} using instance ${config.instanceName}`
      );

      if (mediaUrl && mediaType) {
        return this.sendMediaMessage({
          phoneNumber: formattedPhone,
          mediaUrl,
          mediaType,
          caption: caption || message,
          fileName,
          ...config,
        });
      } else {
        return this.sendTextMessage({
          phoneNumber: formattedPhone,
          message,
          ...config,
        });
      }
    } catch (error) {
      this.logger.error(`Error sending WhatsApp message: ${error.message}`);
      throw error;
    }
  }
}
