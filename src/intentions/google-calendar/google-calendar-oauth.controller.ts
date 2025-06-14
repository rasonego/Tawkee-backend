import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { AuthGuard } from '../../auth/auth.guard';
import { ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';
import { ScheduleValidationService } from './schedule-validation/schedule-validation.service';
import { IntentionsService } from '../intentions.service';
import { WebsocketService } from 'src/websocket/websocket.service';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('Google Calendar OAuth')
@Controller('google-calendar-oauth')
export class GoogleCalendarOAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly scheduleValidationService: ScheduleValidationService,
    private readonly intentionsService: IntentionsService,
    private readonly websocketService: WebsocketService
  ) {}

  @Get('auth-url/:agentId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate Google OAuth URL for agent' })
  @ApiResponse({
    status: 200,
    description: 'Successfully generated auth URL',
    schema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string' },
        state: { type: 'string' },
      },
    },
  })
  async getAuthUrl(@Param('agentId') agentId: string) {
    return this.googleCalendarOAuthService.getCalendarAuthUrl(agentId);
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback with code + state' })
  @ApiResponse({
    status: 200,
    description: 'OAuth code exchanged for access token or user login',
  })
  async handleOAuthCallback(
    @Res() res,
    @Query('code') code?: string,
    @Query('state') state?: string
  ) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // console.log('--- [Google OAuth] Callback triggered ---');
    // console.log('Received code:', code);
    // console.log('Received state:', state);

    if (!code || !state) {
      console.warn('[OAuth] Missing code or state in callback');
      return res.redirect(
        `${frontendUrl}/auth/oauth-result?error=missing_code_or_state`
      );
    }

    try {
      // Decode base64 JSON state with { payload, signature }
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { payload, signature } = decodedState;

      // console.log('[OAuth] Decoded state (raw JSON):', decodedState);
      // console.log('[OAuth] Payload string:', payload);
      // console.log('[OAuth] Signature:', signature);

      if (!payload || !signature) {
        throw new Error(
          'Invalid state structure: missing payload or signature'
        );
      }

      // Verify signature using the raw payload string (do NOT parse before verification)
      const isSignatureValid = this.googleCalendarOAuthService.verifySignature(
        payload,
        signature
      );
      // console.log('[OAuth] Signature valid:', isSignatureValid);

      if (!isSignatureValid) {
        throw new Error('Invalid state signature');
      }

      // Now parse the payload string into an object for further processing
      const payloadObj = JSON.parse(payload);
      // console.log('[OAuth] Parsed payload object:', payloadObj);

      // Distinguish OAuth flows by payload content
      if (payloadObj.agentId) {
        // Calendar OAuth flow
        // console.log('[OAuth] Processing calendar OAuth flow');
        const email =
          await this.googleCalendarOAuthService.exchangeCodeForTokens(
            code,
            state
          );

        await this.scheduleValidationService.updateScheduleSettings(
          payloadObj.agentId,
          { email }
        );

        await this.intentionsService.registerGoogleCalendarIntentions(
          payloadObj.agentId
        );

        const agent = await this.prisma.agent.findUnique({
          where: { id: payloadObj.agentId },
          select: {
            id: true,
            workspaceId: true,
          },
        });

        const scheduleSettings =
          await this.scheduleValidationService.getScheduleSettings(agent.id);

        this.websocketService.sendToClient(
          agent.workspaceId,
          'agentScheduleSettingsUpdate',
          {
            agentId: agent.id,
            scheduleSettings,
          }
        );

        return res.redirect(
          `${frontendUrl}/auth/oauth-result?token=google-calendar-${email}`
        );
      }

      if (payloadObj.type === 'social-login') {
        // Social login flow
        // console.log('[OAuth] Processing social login flow');
        const result =
          await this.googleCalendarOAuthService.exchangeSocialLoginCode(
            code,
            payloadObj
          );

        // Create/find user in DB, then generate JWT token for them
        const user = await this.authService.findOrCreateOAuthUser({
          providerId: result.profile.sub,
          provider: 'google',
          email: result.profile.email,
          firstName: result.profile.name,
          avatar: result.profile.picture,
        });

        const jwt = this.authService.generateJwtToken(user);

        return res.redirect(`${frontendUrl}/auth/oauth-result?token=${jwt}`);
      }

      console.warn('[OAuth] Unknown state payload');
      return res.redirect(
        `${frontendUrl}/auth/oauth-result?error=invalid_state`
      );
    } catch (err) {
      console.error('[OAuth] Callback processing failed:', err);
      return res.redirect(
        `${frontendUrl}/auth/oauth-result?error=callback_failed`
      );
    }
  }

  @Get('auth-status/:agentId')
  @ApiOperation({ summary: 'Check agent Google Calendar auth status' })
  @ApiResponse({
    status: 200,
    description: 'Agent auth status returned',
    schema: {
      type: 'object',
      properties: {
        isAuthenticated: { type: 'boolean' },
        needsRefresh: { type: 'boolean' },
        expiresAt: { type: 'number' },
        scopes: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async getAuthStatus(@Param('agentId') agentId: string) {
    return this.googleCalendarOAuthService.getAuthStatus(agentId);
  }

  @Post('refresh-token/:agentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Google Calendar access token for agent' })
  @ApiResponse({
    status: 200,
    description: 'Access token refreshed',
  })
  async refreshToken(@Param('agentId') agentId: string) {
    return this.googleCalendarOAuthService.refreshAccessToken(agentId);
  }

  @Get('valid-token/:agentId')
  @ApiOperation({
    summary: 'Get valid (possibly refreshed) access token for agent',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
      },
    },
  })
  async getValidToken(@Param('agentId') agentId: string) {
    const accessToken =
      await this.googleCalendarOAuthService.getValidAccessToken(agentId);
    return { access_token: accessToken };
  }

  @Delete('revoke/:agentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an agent’s Google Calendar credentials' })
  @ApiResponse({
    status: 200,
    description: 'Tokens revoked',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  async revokeTokens(@Param('agentId') agentId: string) {
    return this.googleCalendarOAuthService.revokeAgentTokens(agentId);
  }

  @Get('agents')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all agents with Google Calendar tokens' })
  @ApiResponse({
    status: 200,
    description: 'List of agents and token info',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          expiresAt: { type: 'number' },
          scopes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  })
  async getAllAgentTokens() {
    return this.googleCalendarOAuthService.findAllAgentTokens();
  }
}
