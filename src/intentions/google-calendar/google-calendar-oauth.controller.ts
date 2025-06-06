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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { AuthGuard } from '../../auth/auth.guard';

@ApiTags('Google Calendar OAuth')
@Controller('google-calendar-oauth')
export class GoogleCalendarOAuthController {
  constructor(
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
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
    return this.googleCalendarOAuthService.getAuthUrl(agentId);
  }

  @Get('callback')
  @ApiOperation({ summary: 'Handle Google OAuth callback with code + state' })
  @ApiResponse({
    status: 200,
    description: 'OAuth code exchanged for access token successfully',
  })
  async handleOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return this.googleCalendarOAuthService.exchangeCodeForTokens(code, state);
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
  @ApiOperation({ summary: 'Get valid (possibly refreshed) access token for agent' })
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
    const accessToken = await this.googleCalendarOAuthService.getValidAccessToken(agentId);
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
