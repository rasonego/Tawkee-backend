import {
  Controller,
  Post,
  Body,
  Logger,
  HttpCode,
  Get,
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
  ApiQuery,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ConfigService } from '@nestjs/config';
import { DeepseekService } from '../deepseek/deepseek.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
    private readonly deepseekAiService: DeepseekService
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
    // try {
    //   this.logger.debug(
    //     `[REQ:${requestId}] Complete webhook payload: ${JSON.stringify(webhookData, null, 2)}`
    //   );
    //   this.logger.debug(
    //     `[REQ:${requestId}] Headers: ${JSON.stringify(headers, null, 2)}`
    //   );
    // } catch (e) {
    //   this.logger.debug(
    //     `[REQ:${requestId}] Cannot stringify payload: ${e.message}`
    //   );
    // }

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
    // this.logger.log(
    //   `[REQ:${requestId}] Received webhook from instance=${instanceName}, event=${eventType}`
    // );

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
    // try {
    //   this.logger.debug(
    //     `[REQ:${requestId}] Complete webhook payload: ${JSON.stringify(webhookData, null, 2)}`
    //   );
    //   this.logger.debug(
    //     `[REQ:${requestId}] Headers: ${JSON.stringify(headers, null, 2)}`
    //   );
    // } catch (e) {
    //   this.logger.debug(
    //     `[REQ:${requestId}] Cannot stringify payload: ${e.message}`
    //   );
    // }

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
}
