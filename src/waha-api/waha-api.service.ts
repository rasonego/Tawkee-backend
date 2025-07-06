import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MediaDto } from 'src/chats/dto/send-message.dto';

interface CreateInstanceOptions {
  workspaceId: string;
  agentId: string;
  channelId: string;
  instanceName: string;
  serverUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

interface SendTextMessageOptions {
  phoneNumber: string;
  message: string;
  instanceName: string; // Primary identifier for Waha API
  serverUrl: string;
  apiKey: string;
  instanceId?: string; // Made optional as we're using instanceName
}

interface SendMediaMessageOptions {
  phoneNumber: string;
  mediaUrl: any;
  caption?: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mediaMimeType: string;
  fileName?: string;
  instanceName: string; // Primary identifier for Waha API
  serverUrl: string;
  apiKey: string;
  instanceId?: string; // Made optional as we're using instanceName
}

@Injectable()
export class WahaApiService {
  private readonly logger = new Logger(WahaApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Waha API configuration from environment variables
   * @returns {Object} Object containing server URL and API key
   */
  getWahaConfig() {
    const serverUrl = process.env.WAHA_API_URL;
    const apiKey = process.env.WAHA_API_KEY;

    if (!serverUrl || !apiKey) {
      throw new Error(
        'Missing WAHA_API_URL or WAHA_API_KEY environment variables'
      );
    }

    return { serverUrl, apiKey };
  }

  /**
   * Send a text message through Waha API
   */
  async sendTextMessage(options: SendTextMessageOptions): Promise<any> {
    try {
      const { phoneNumber, message, instanceName, serverUrl, apiKey } = options;

      // Ensure phone number is properly formatted - remove any non-numeric characters except +
      const formattedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // If phone number doesn't start with +, ensure it doesn't start with a leading 0
      const finalPhoneNumber = formattedPhone.startsWith('+')
        ? formattedPhone.substring(1) // Waha API doesn't want the + prefix
        : formattedPhone.replace(/^0/, ''); // Remove leading 0 if present

      // This must actually only happen on the first time sending message to the contact
      this.logger.log(
        `Checking actual ${finalPhoneNumber} chatId value using instance ${instanceName} on ${serverUrl}`
      );
      let response = await axios.get(
        `${serverUrl}/contacts/check-exists?phone=${finalPhoneNumber}&session=${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      const chatId = response.data.chatId;

      this.logger.log(
        `Sending message to ${finalPhoneNumber} using instance ${instanceName}`
      );
      const payload = {
        session: instanceName,
        chatId,
        text: message,
      };

      this.logger.debug(`Sending with payload: ${JSON.stringify(payload)}`);

      response = await axios.post(`${serverUrl}/sendText`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200 || response.status === 201) {
        this.logger.log(`Message sent successfully to ${finalPhoneNumber}`);
        return response.data;
      } else {
        // Log the issue but don't throw an error since the message might have been sent
        this.logger.warn(
          `Unexpected response from Waha API: ${JSON.stringify(response.data)}`
        );
        throw new Error(
          `Failed to send text message: ${response.status}: ${response.statusText}`
        );
      }
    } catch (error) {
      // Specific error handling for common API errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        this.logger.error(
          `Waha API error: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
        );

        // Check for specific error codes and provide more helpful messages
        if (error.response.status === 401) {
          throw new Error('Authentication failed. Check your API key.');
        } else if (error.response.status === 404) {
          throw new Error(
            'Instance not found. It may have been deleted or not created correctly.'
          );
        } else if (error.response.status === 410) {
          throw new Error(
            'WhatsApp session is not active. The QR code may need to be rescanned.'
          );
        } else if (error.response.status === 500) {
          throw new Error(
            'Server error from Waha API. The instance may not be connected properly.'
          );
        }
      } else if (error.request) {
        // The request was made but no response was received
        this.logger.error(`Waha API no response: ${error.message}`);
        throw new Error(
          'No response from Waha API server. Check your server URL and network connection.'
        );
      }

      // Generic error logging
      this.logger.error(`Error sending message: ${error.message}`, error.stack);
      throw new Error(error.message);
    }
  }

  async sendMediaMessage(options: SendMediaMessageOptions): Promise<any> {
    try {
      const {
        phoneNumber,
        mediaUrl,
        caption,
        mediaType,
        mediaMimeType,
        fileName,
        instanceName,
        serverUrl,
        apiKey,
      } = options;

      // Ensure phone number is properly formatted - remove any non-numeric characters except +
      const formattedPhone = phoneNumber.replace(/[^\d+]/g, '');

      // If phone number doesn't start with +, ensure it doesn't start with a leading 0
      const finalPhoneNumber = formattedPhone.startsWith('+')
        ? formattedPhone.substring(1) // Waha API doesn't want the + prefix
        : formattedPhone.replace(/^0/, ''); // Remove leading 0 if present

      // This must actually only happen on the first time sending message to the contact
      this.logger.log(
        `Checking actual ${finalPhoneNumber} chatId value using instance ${instanceName}`
      );
      let response = await axios.get(
        `${serverUrl}/contacts/check-exists?phone=${finalPhoneNumber}&session=${instanceName}`,
        {
          headers: {
            'x-api-key': apiKey,
          },
        }
      );

      const chatId = response.data.chatId;

      this.logger.log(
        `Sending ${mediaType} to ${finalPhoneNumber} using instance ${instanceName}`
      );

      let endpoint;
      const payload: any = {
        session: instanceName,
        chatId,
      };

      switch (mediaType) {
        case 'image': {
          endpoint = 'sendImage';
          payload.caption = caption ? caption : '';
          payload.file = {
            mimetype: mediaMimeType,
            filename: fileName,
            data: mediaUrl
          };
          break;
        }
        case 'video': {
          endpoint = 'sendVideo';
          payload.caption = caption ? caption : '';
          payload.convert = true;
          payload.asNote = false;
          payload.file = {
            mimetype: mediaMimeType,
            filename: fileName,
            data: mediaUrl
          };
          break;
        }
        case 'audio': {
          endpoint = 'sendVoice';
          this.logger.debug('Converting data to base64...');
          const base64String = mediaUrl.toString('base64');

          payload.file = {
            mimetype: 'audio/ogg; codecs=opus',
            filename: 'audio.ogg',
            data: base64String
          };
          payload.convert = true;
          break;
        }
        case 'document': {
          endpoint = 'sendFile';
          payload.caption = caption ? caption : '';
          payload.file = {
            mimetype: mediaMimeType,
            filename: fileName, 
            data: mediaUrl
          };
          break;
        }
        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      this.logger.debug(
        `Sending media with payload: ${JSON.stringify(payload).slice(0, 250)}... to ${serverUrl}/${endpoint}`
      );

      // According to Waha API docs, use instanceName instead of instanceId
      response = await axios.post(`${serverUrl}/${endpoint}`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        timeout: 60000, // 60 seconds timeout for media (larger than text timeout)
      });

      // Apply the same improved validation logic as for text messages
      if (response.status === 200 || response.status === 201) {
        this.logger.log(`Media sent successfully to ${finalPhoneNumber}`);
        return response.data;
      } else {
        // Log the issue but don\'t throw an error since the media might have been sent
        this.logger.warn(
          `Unexpected response from Waha API for media: ${JSON.stringify(response.data)}`
        );
        throw new Error(
          `Failed to send media message: ${response.status}: ${response.statusText}`
        );
      }
    } catch (error) {
      // Specific error handling for common API errors
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.log(error);
        this.logger.error(
          `Waha API error (media): Status ${error.response.status}`
        );

        // Check for specific error codes and provide more helpful messages
        if (error.response.status === 401) {
          throw 'Authentication failed. Check your API key.';
        } else if (error.response.status === 404) {
          throw 'Instance not found. It may have been deleted or not created correctly.';
        } else if (error.response.status === 410) {
          throw 'WhatsApp session is not active. The QR code may need to be rescanned.';
        } else if (error.response.status === 500) {
          throw 'Server error from Waha API. The instance may not be connected properly or media URL is invalid.';
        }
      } else if (error.request) {
        // The request was made but no response was received
        this.logger.error(`Waha API no response (media): ${error.message}`);
        throw 'No response from Waha API server. Check your server URL and network connection.';
      }

      // Generic error logging
      this.logger.error(`Error sending media: ${error.message}`, error.stack);
      throw error.message;
    }
  }

  /**
   * Get channel configuration for Waha API
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
    if (!config || !config.wahaApi || !config.wahaApi.instanceName) {
      return null;
    }

    try {
      // Get server URL and API key from environment vars if not in config
      const { serverUrl, apiKey } = this.getWahaConfig();

      return {
        instanceId: config.wahaApi.instanceId,
        instanceName: config.wahaApi.instanceName,
        // Use values from config if they exist, otherwise fall back to environment variables
        serverUrl: config.wahaApi.serverUrl || serverUrl,
        apiKey: config.wahaApi.apiKey || apiKey,
      };
    } catch (error) {
      this.logger.error(`Error getting Waha API config: ${error.message}`);

      // If config has all the required values, return them even if env vars are missing
      if (
        config.wahaApi.serverUrl &&
        config.wahaApi.apiKey &&
        (config.wahaApi.instanceName || config.wahaApi.instanceId)
      ) {
        return {
          instanceId: config.wahaApi.instanceId,
          instanceName:
            config.wahaApi.instanceName || config.wahaApi.instanceId,
          serverUrl: config.wahaApi.serverUrl,
          apiKey: config.wahaApi.apiKey,
        };
      }

      return null;
    }
  }

  /**
   * Create a new instance on Waha API
   */
  async createInstance(options: CreateInstanceOptions): Promise<any> {
    try {
      const {
        workspaceId,
        agentId,
        channelId,
        instanceName,
        serverUrl,
        apiKey,
        webhookUrl,
      } = options;

      // First, check if the instance already exists
      try {
        const response = await axios.get(`${serverUrl}/sessions`, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        });

        // If the instance already exists, return it
        if (response.data && Array.isArray(response.data)) {
          const existingInstance = response.data.find(
            (instance: any) => instance.name === instanceName
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

      this.logger.log(
        `Creating instance ${instanceName} of ${agentId} on Waha API at ${serverUrl} with apiKey ${apiKey} and webhookUrl ${webhookUrl}`
      );

      // Create the instance
      const createResponse = await axios.post(
        `${serverUrl}/sessions`,
        {
          name: instanceName,
          start: true,
          config: {
            metadata: {
              workspaceId,
              agentId,
              channelId,
            },
            webhooks: [
              {
                url: process.env.WAHA_WEBHOOK_URL,
                events: ['session.status', 'message'],
                customHeaders: [
                  {
                    name: 'Authorization',
                    value: `Bearer ${process.env.WEBHOOK_TOKEN}`,
                  },
                ],
              },
            ],
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
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
   * Get instance info
   */
  async getInstance(
    instanceName: string = 'default',
    serverUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      this.logger.log(
        `Getting ${instanceName} info`
      );

      // According to Waha API docs, use the instance name here (not instance ID)
      const response = await axios.get(
        `${serverUrl}/sessions/${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      if (response.status === 200) {
        this.logger.log(
          `Instance's ${instanceName} info received: ${JSON.stringify(response.data)}`
        );

        // The Waha API can return various response formats
        return response.data;
      } else {
        throw new Error(
          `Failed to instance info: ${JSON.stringify(response.data)}`
        );
      }
    } catch (error) {
      this.logger.error(`Error getting instance info: ${error.message}`, error.stack);
      throw error;
    }
  }  

  /**
   * Get QR code for instance connection
   */
  async getInstanceQR(
    channelId: string,
    instanceName: string = 'default',
    serverUrl: string,
    apiKey: string
  ): Promise<any> {
    try {
      this.logger.log(
        `Getting QR code for instance ${instanceName} using channel ${channelId}`
      );

      await this.prisma.channel.update({
        where: { id: channelId },
        data: {}, // qualquer update já atualiza o updatedAt automaticamente
      });

      // According to Waha API docs, use the instance name here (not instance ID)
      this.logger.debug(`${serverUrl}/${instanceName}/auth/qr?format=raw`);
      const response = await axios.get(
        `${serverUrl}/${instanceName}/auth/qr?format=raw`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      if (response.status === 200) {
        this.logger.log(
          `QR response received for instance ${instanceName}: ${JSON.stringify(response.data)}`
        );

        // The Waha API can return various response formats
        return response.data;
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
   * Logout from WhatsApp on an Waha API instance without deleting the instance
   */
  async logoutInstance(options: {
    instanceName: string;
    serverUrl: string;
    apiKey: string;
  }): Promise<any> {
    try {
      const { instanceName, serverUrl, apiKey } = options;

      this.logger.log(
        `Logging out WhatsApp session for instance ${instanceName} with ${JSON.stringify(options)}`
      );

      // According to Waha API docs, use logout endpoint with instance name
      const response = await axios.post(
        `${serverUrl}/sessions/${instanceName}/logout`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      if (response.data.status === 'STARTING') {
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
          message: 'Unexpected response from Waha API',
          data: response.data,
        };
      }
    } catch (error) {
      this.logger.error(
        `Error logging out from WhatsApp: ${JSON.stringify(error, null, 3)}`,
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
          message: 'No response from Waha API server',
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
   * Start an Waha API instance
   */
  async startInstance(instanceName: string): Promise<any> {
    try {

      this.logger.log(`Starting instance ${instanceName} from Waha API`);

      const { serverUrl, apiKey } = this.getWahaConfig();

      // According to Waha API docs, use the instance name here (not instance ID)
      const response = await axios.post(
        `${serverUrl}/sessions/${instanceName}/start`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      this.logger.log(`Instance ${instanceName} started successfully`);
      return response.data;

    } catch (error) {
      this.logger.error(
        `Error starting instance: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }  

  /**
   * Stop an Waha API instance
   */
  async stopInstance(instanceName: string): Promise<any> {
    try {

      this.logger.log(`Stopping instance ${instanceName} from Waha API`);

      const { serverUrl, apiKey } = this.getWahaConfig();

      await this.logoutInstance({instanceName, serverUrl, apiKey });

      // According to Waha API docs, use the instance name here (not instance ID)
      const response = await axios.post(
        `${serverUrl}/sessions/${instanceName}/stop`,
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );
      
      this.logger.log(`Instance ${instanceName} stopped successfully`);
      return response.data;

    } catch (error) {
      this.logger.error(
        `Error stopping instance: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }  

  /**
   * Delete an Waha API instance
   */
  async deleteInstance(instanceName: string): Promise<any> {
    try {

      this.logger.log(`Deleting instance ${instanceName} from Waha API`);

      const { serverUrl, apiKey } = this.getWahaConfig();

      // According to Waha API docs, use the instance name here (not instance ID)
      const response = await axios.delete(
        `${serverUrl}/sessions/${instanceName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
        }
      );

      this.logger.log(`Instance ${instanceName} deleted successfully`);
      return response.data;

    } catch (error) {
      this.logger.error(
        `Error deleting instance: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  async sendWhatsAppMessage(
    agentId: string,
    phoneNumber: string,
    message: string,

    // THESE OPTIONAL VARIABLES ARE CURRENTLY UNUSED SINCE WE NEVER SEND MEDIA MESSAGES TO USERS, ONLY TEXT
    // THIS METHOD IS BEING USED BY AGENTS RESPONDING TO USER MESSAGES AND BY THE SYSTEM ITSELF.
    media?: MediaDto
  ): Promise<any> {
    let mediaUrl;
    let mediaType;
    let mediaMimeType;
    let fileName;
    let mediaCaption;

    if (media) {
      const { url, type, mimetype, filename, caption } = media;

      mediaUrl = url;
      mediaType = type;
      mediaMimeType = mimetype;
      fileName = filename;
      mediaCaption = caption;
    }

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
          `No Waha API config found for channel ${channel.id}, trying to use environment variables`
        );

        try {
          const { serverUrl, apiKey } = this.getWahaConfig();

          if (
            !channel.config ||
            !channel.config['wahaApi'] ||
            !channel.config['wahaApi']['instanceName']
          ) {
            throw new Error('Missing Waha API instance name in channel config');
          }

          // Extract just the instanceName from channel config
          const instanceName = channel.config['wahaApi']['instanceName'];

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
            `Failed to get Waha API config from environment: ${error.message}`
          );
          throw new Error(
            `No Waha API configuration available for channel ${channel.id}`
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
          mediaMimeType,
          fileName,
          caption: mediaCaption || message,
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
