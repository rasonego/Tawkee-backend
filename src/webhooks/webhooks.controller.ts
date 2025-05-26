import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Get,
  Param,
  Query,
  UseGuards,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ConfigService } from '@nestjs/config';
import { OpenAiService } from '../openai/openai.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
    private readonly openAiService: OpenAiService
  ) {}

  @Post('evolution')
  @HttpCode(201)
  @ApiOperation({ summary: 'Handle webhook events from Evolution API' })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for webhook authentication',
    required: true,
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  async handleEvolutionWebhook(
    @Body() webhookData: any,
    @Headers() headers: any
  ): Promise<{ success: boolean }> {
    // Enhanced logging for incoming webhooks
    const instanceName = webhookData?.instance || 'unknown-instance';
    const eventType = webhookData?.event || 'unknown-event';
    const requestId = Math.random().toString(36).substring(2, 10); // Generate a unique ID for this request

    // Log basic webhook info with request ID for tracking
    this.logger.log(
      `[REQ:${requestId}] Received webhook from instance=${instanceName}, event=${eventType}`
    );

    // Log detailed info about the message if it's a messages.upsert event
    if (eventType === 'messages.upsert') {
      try {
        const messageData = webhookData?.data || {};
        const phoneNumber =
          messageData?.key?.remoteJid?.split('@')[0] || 'unknown';
        const fromMe =
          messageData?.key?.fromMe === true ? 'outgoing' : 'incoming';
        const messageId = messageData?.key?.id || 'unknown-id';
        const messageContent =
          messageData?.message?.conversation || 'empty-content';
        const pushName = messageData?.pushName || 'unknown-sender';

        this.logger.log(
          `[REQ:${requestId}] WhatsApp ${fromMe} message: instance=${instanceName}, phone=${phoneNumber}, sender=${pushName}, messageId=${messageId}`
        );
        this.logger.log(
          `[REQ:${requestId}] Message content: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`
        );
      } catch (error) {
        this.logger.warn(
          `[REQ:${requestId}] Error extracting message details: ${error.message}`
        );
      }
    }

    // Log connection updates separately
    if (eventType === 'connection.update') {
      try {
        const state = webhookData?.data?.state || 'unknown';
        const statusReason = webhookData?.data?.statusReason || 'unknown';
        this.logger.log(
          `[REQ:${requestId}] Connection update: instance=${instanceName}, state=${state}, statusReason=${statusReason}`
        );
      } catch (error) {
        this.logger.warn(
          `[REQ:${requestId}] Error extracting connection update details: ${error.message}`
        );
      }
    }

    // Full payload logging (not just in development, since we need to diagnose)
    try {
      this.logger.debug(
        `[REQ:${requestId}] Complete webhook payload: ${JSON.stringify(webhookData, null, 2)}`
      );
      this.logger.debug(
        `[REQ:${requestId}] Headers: ${JSON.stringify(headers, null, 2)}`
      );
    } catch (e) {
      this.logger.debug(
        `[REQ:${requestId}] Cannot stringify payload: ${e.message}`
      );
    }

    // Get webhook token directly from process.env
    const expectedToken = process.env.WEBHOOK_TOKEN;

    // Only perform validation if token is set in environment
    if (expectedToken) {
      try {
        // Extract the token from the Authorization header
        const authHeader = headers.authorization;
        this.logger.debug(
          `[REQ:${requestId}] Webhook validation: received authorization header=${!!authHeader}`
        );

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          this.logger.warn(
            `[REQ:${requestId}] Webhook token validation failed - missing or invalid Authorization header`
          );
          throw new UnauthorizedException(
            'Missing or invalid Authorization header'
          );
        }

        // Extract the token (remove 'Bearer ' prefix)
        const token = authHeader.substring(7);

        // Check if the token matches the expected token
        const isValid = token === expectedToken;

        if (!isValid) {
          this.logger.warn(
            `[REQ:${requestId}] Webhook token validation failed - token does not match WEBHOOK_TOKEN`
          );
          throw new UnauthorizedException('Invalid webhook token');
        } else {
          this.logger.log(
            `[REQ:${requestId}] Webhook token validation successful`
          );
        }
      } catch (error) {
        this.logger.error(
          `[REQ:${requestId}] Error validating webhook token: ${error.message}`
        );
        throw new UnauthorizedException('Webhook authentication failed');
      }
    } else {
      this.logger.log(
        `[REQ:${requestId}] No webhook token validation - WEBHOOK_TOKEN not set in environment`
      );
    }

    // Log before passing to service
    this.logger.log(
      `[REQ:${requestId}] Processing webhook for instance=${instanceName}, event=${eventType}`
    );

    try {
      const result =
        await this.webhooksService.handleEvolutionWebhook(webhookData);
      this.logger.log(
        `[REQ:${requestId}] Webhook processing completed with success=${result.success}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[REQ:${requestId}] Error processing webhook: ${error.message}`
      );
      // Return successful response to Evolution API even if processing failed
      // This prevents retries that might flood the system
      return { success: true };
    }
  }

  @Post('waha')
  @HttpCode(201)
  @ApiOperation({ summary: 'Handle webhook events from Waha API' })
  @ApiHeader({
    name: 'Authorization',
    description: 'Bearer token for webhook authentication',
    required: true,
    schema: { type: 'string' },
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  async handleWahaWebhook(
    @Body() webhookData: any,
    @Headers() headers: any
  ): Promise<{ success: boolean }> {
    // Enhanced logging for incoming webhooks
    const instanceName = webhookData?.session || 'unknown-instance';
    const eventType = webhookData?.event || 'unknown-event';
    const requestId = Math.random().toString(36).substring(2, 10); // Generate a unique ID for this request

    // Log basic webhook info with request ID for tracking
    this.logger.log(
      `[REQ:${requestId}] Received webhook from instance=${instanceName}, event=${eventType}`
    );

    // Log detailed info about the message if it's a message event
    if (eventType === 'message') {
      try {
        const payload = webhookData?.payload || {};
        const phoneNumber = payload?.from?.split('@')[0] || 'unknown';
        const fromMe = payload?.fromMe === true ? 'outgoing' : 'incoming';
        const messageId = payload?.id || 'unknown-id';
        const messageContent = payload?.body || 'empty-content';
        const pushName = payload?._data?.notifyName || 'unknown-sender';

        this.logger.log(
          `[REQ:${requestId}] WhatsApp ${fromMe} message: instance=${instanceName}, phone=${phoneNumber}, sender=${pushName}, messageId=${messageId}`
        );
        this.logger.log(
          `[REQ:${requestId}] Message content: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`
        );
      } catch (error) {
        this.logger.warn(
          `[REQ:${requestId}] Error extracting message details: ${error.message}`
        );
      }
    }

    // Log session status separately
    if (eventType === 'session.status') {
      try {
        const status = webhookData?.payload?.status || 'unknown';
        this.logger.log(
          `[REQ:${requestId}] Connection update: instance=${instanceName}, status=${status}`
        );
      } catch (error) {
        this.logger.warn(
          `[REQ:${requestId}] Error extracting connection update details: ${error.message}`
        );
      }
    }

    // Full payload logging (not just in development, since we need to diagnose)
    try {
      this.logger.debug(
        `[REQ:${requestId}] Complete webhook payload: ${JSON.stringify(webhookData, null, 2)}`
      );
      this.logger.debug(
        `[REQ:${requestId}] Headers: ${JSON.stringify(headers, null, 2)}`
      );
    } catch (e) {
      this.logger.debug(
        `[REQ:${requestId}] Cannot stringify payload: ${e.message}`
      );
    }

    // Get webhook token directly from process.env
    const expectedToken = process.env.WEBHOOK_TOKEN;

    // Only perform validation if token is set in environment
    if (expectedToken) {
      try {
        // Extract the token from the Authorization header
        const authHeader = headers.authorization;
        this.logger.debug(
          `[REQ:${requestId}] Webhook validation: received authorization header=${!!authHeader}`
        );

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          this.logger.warn(
            `[REQ:${requestId}] Webhook token validation failed - missing or invalid Authorization header`
          );
          throw new UnauthorizedException(
            'Missing or invalid Authorization header'
          );
        }

        // Extract the token (remove 'Bearer ' prefix)
        const token = authHeader.substring(7);

        // Check if the token matches the expected token
        const isValid = token === expectedToken;

        if (!isValid) {
          this.logger.warn(
            `[REQ:${requestId}] Webhook token validation failed - token does not match WEBHOOK_TOKEN`
          );
          throw new UnauthorizedException('Invalid webhook token');
        } else {
          this.logger.log(
            `[REQ:${requestId}] Webhook token validation successful`
          );
        }
      } catch (error) {
        this.logger.error(
          `[REQ:${requestId}] Error validating webhook token: ${error.message}`
        );
        throw new UnauthorizedException('Webhook authentication failed');
      }
    } else {
      this.logger.log(
        `[REQ:${requestId}] No webhook token validation - WEBHOOK_TOKEN not set in environment`
      );
    }

    // Log before passing to service
    this.logger.log(
      `[REQ:${requestId}] Processing webhook for instance=${instanceName}, event=${eventType}`
    );

    try {
      const result = await this.webhooksService.handleWahaWebhook(webhookData);
      this.logger.log(
        `[REQ:${requestId}] Webhook processing completed with success=${result.success}`
      );
      return result;
    } catch (error) {
      this.logger.error(
        `[REQ:${requestId}] Error processing webhook: ${error.message}`
      );
      // Return successful response to Evolution API even if processing failed
      // This prevents retries that might flood the system
      return { success: true };
    }
  }

  @Get('test-send/:agentId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Test sending a WhatsApp message via Evolution API',
  })
  @ApiParam({ name: 'agentId', description: 'The agent ID' })
  @ApiQuery({
    name: 'phone',
    description: 'The WhatsApp phone number to send to',
  })
  @ApiQuery({ name: 'message', description: 'The message to send' })
  @ApiResponse({
    status: 200,
    description: 'Message sent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example: 'Message sent successfully to 5511912345678',
        },
        data: {
          type: 'object',
          description: 'The full response from Evolution API',
          example: {
            key: {
              remoteJid: '5511912345678@s.whatsapp.net',
              fromMe: true,
              id: '3EB0774B447FCF09ED774469267B32A48D38351E',
            },
            message: {
              conversation: 'Test message',
            },
            messageTimestamp: 1746431871,
            instanceId: '48dfda89-d955-46ea-994e-b7f056907890',
          },
        },
      },
    },
  })
  async testSendMessage(
    @Param('agentId') agentId: string,
    @Query('phone') phone: string,
    @Query('message') message: string
  ): Promise<{ success: boolean; message: string; data?: any }> {
    this.logger.log(
      `Testing WhatsApp message to ${phone} via agent ${agentId}`
    );

    try {
      // Get the response from Evolution API
      const response = await this.webhooksService.testSendMessage(
        agentId,
        phone,
        message
      );

      // If we have a key in the response, it means the message was sent successfully
      if (response && response.key) {
        return {
          success: true,
          message: `Message sent successfully to ${phone}`,
          data: response, // Include the full response for debugging
        };
      } else {
        // Something went wrong but no exception was thrown
        return {
          success: false,
          message: `Unexpected response from Evolution API`,
          data: response,
        };
      }
    } catch (error) {
      this.logger.error(`Error sending test message: ${error.message}`);
      return {
        success: false,
        message: `Failed to send message: ${error.message}`,
      };
    }
  }

  @Get('test-connection-update')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test connection.update event processing' })
  @ApiQuery({
    name: 'instance',
    description: 'The instance name',
    required: true,
  })
  @ApiQuery({
    name: 'state',
    description: 'The connection state (open, close, connecting)',
    required: true,
  })
  @ApiQuery({
    name: 'statusReason',
    description: 'The status reason code (e.g., 200, 401)',
    required: false,
  })
  @ApiQuery({
    name: 'skipDb',
    description: 'Skip storing webhook event in database (for testing)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Connection update processed successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Connection update processed' },
        connectionState: { type: 'string', example: 'open' },
        isConnected: { type: 'boolean', example: true },
      },
    },
  })
  async testConnectionUpdate(
    @Query('instance') instance: string,
    @Query('state') state: string,
    @Query('statusReason') statusReason?: number,
    @Query('skipDb') skipDb?: string
  ): Promise<{
    success: boolean;
    message: string;
    connectionState: string;
    isConnected: boolean;
  }> {
    this.logger.log(
      `Testing connection.update for instance ${instance} with state ${state}`
    );

    try {
      // Create a simulated connection.update webhook payload
      const webhookData = {
        event: 'connection.update',
        instance: instance,
        data: {
          instance: instance,
          state: state,
          statusReason: statusReason || (state === 'open' ? 200 : 401),
        },
        date_time: new Date().toISOString(),
        _testMode: skipDb === 'true', // Flag to skip database operations in test mode
      };

      // Process the simulated webhook
      const result =
        await this.webhooksService.handleEvolutionWebhook(webhookData);

      // Determine connection state for response
      const isConnected = state === 'open';

      return {
        success: result.success,
        message: `Connection update processed for state: ${state}`,
        connectionState: state,
        isConnected,
      };
    } catch (error) {
      this.logger.error(
        `Error processing test connection update: ${error.message}`
      );
      return {
        success: false,
        message: `Failed to process connection update: ${error.message}`,
        connectionState: state,
        isConnected: state === 'open',
      };
    }
  }

  @Get('test-openai')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Test OpenAI integration with communication and goal guides',
  })
  @ApiQuery({
    name: 'prompt',
    description: 'The prompt to send to OpenAI',
    required: true,
  })
  @ApiQuery({
    name: 'communicationType',
    description: 'Communication style (FORMAL, NORMAL, RELAXED)',
    required: false,
    default: 'NORMAL',
  })
  @ApiQuery({
    name: 'agentType',
    description: 'Agent type (SUPPORT, SALE, PERSONAL)',
    required: false,
    default: 'SUPPORT',
  })
  @ApiQuery({
    name: 'isActive',
    description: 'Whether the test agent should be considered active',
    required: false,
    default: 'true',
  })
  @ApiResponse({
    status: 200,
    description: 'AI response generated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        prompt: {
          type: 'string',
          example: 'How can I help you with your issue?',
        },
        response: {
          type: 'string',
          example:
            'I understand you need help with your issue. Let me assist you step by step...',
        },
        communicationType: { type: 'string', example: 'NORMAL' },
        agentType: { type: 'string', example: 'SUPPORT' },
        isActive: { type: 'boolean', example: true },
      },
    },
  })
  async testOpenAI(
    @Query('prompt') prompt: string,
    @Query('communicationType') communicationType: string = 'NORMAL',
    @Query('agentType') agentType: string = 'SUPPORT',
    @Query('isActive') isActive: string = 'true'
  ): Promise<{
    success: boolean;
    prompt: string;
    response: string;
    communicationType: string;
    agentType: string;
    isActive: boolean;
  }> {
    this.logger.log(`Testing OpenAI integration with prompt: ${prompt}`);

    // Parse isActive query parameter (defaults to true if not valid)
    const agentIsActive = isActive?.toLowerCase() !== 'false';

    // Check if mock agent is inactive
    if (!agentIsActive) {
      this.logger.warn('Test agent is inactive, cannot generate response');
      return {
        success: false,
        prompt,
        response: 'Agent is inactive and cannot process messages',
        communicationType: communicationType || 'NORMAL',
        agentType: agentType || 'SUPPORT',
        isActive: false,
      };
    }

    try {
      // Import the utilities
      const { getCommunicationGuide } = await import(
        '../common/utils/communication-guides'
      );
      const { getGoalGuide } = await import('../common/utils/goal-guides');

      // Get guides based on provided types
      const communicationGuide = getCommunicationGuide(
        communicationType || 'NORMAL'
      );
      const goalGuide = getGoalGuide(agentType || 'SUPPORT');

      // Create a mock agent
      const mockAgent = {
        id: 'test-agent-id',
        name: 'Test Agent',
        type: agentType || 'SUPPORT',
        communicationType: communicationType || 'NORMAL',
        jobName: 'Technical Support Specialist',
        jobSite: 'https://tawkee.ai',
        jobDescription:
          'Provides expert technical support for our AI-powered WhatsApp automation platform, helping customers resolve issues and maximize the benefits of our service.',
        isActive: agentIsActive,
        trainings: [
          {
            title: 'Product Knowledge',
            content:
              'Our product is designed to help users automate customer service.',
          },
        ],
        intentions: [
          {
            title: 'Be helpful',
            content:
              'Always aim to resolve user issues efficiently and accurately.',
          },
        ],
        // Add agent settings to test the behavior settings integration
        settings: {
          preferredModel: 'GPT_4_O', // Using the newest model
          timezone: 'UTC',
          enabledHumanTransfer: true,
          enabledReminder: true,
          splitMessages: true,
          enabledEmoji: true,
          limitSubjects: true,
          messageGroupingTime: 'NO_GROUP',
        },
      };

      // Generate response using OpenAI
      const response = await this.openAiService.generateAgentResponse(
        prompt,
        mockAgent,
        communicationGuide,
        goalGuide
      );

      return {
        success: true,
        prompt,
        response,
        communicationType: communicationType || 'NORMAL',
        agentType: agentType || 'SUPPORT',
        isActive: agentIsActive,
      };
    } catch (error) {
      this.logger.error(`Error generating OpenAI response: ${error.message}`);
      return {
        success: false,
        prompt,
        response: `Failed to generate response: ${error.message}`,
        communicationType: communicationType || 'NORMAL',
        agentType: agentType || 'SUPPORT',
        isActive: agentIsActive,
      };
    }
  }
}
