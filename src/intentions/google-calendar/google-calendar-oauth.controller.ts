import { 
  Controller, 
  Get, 
  Post, 
  Delete, 
  Body, 
  Param, 
  Query,
  HttpCode,
  HttpStatus 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { 
  GoogleAuthUrlDto,
  GoogleTokenExchangeDto,
  GoogleAuthStatusDto,
  GoogleRevokeTokensDto 
} from './dto';

@ApiTags('Google Calendar OAuth')
@Controller('google-calendar-oauth')
export class GoogleCalendarOAuthController {
  constructor(
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService
  ) {}

  @Get('auth-url/:userId')
  @ApiOperation({ summary: 'Get Google OAuth authorization URL' })
  @ApiResponse({ 
    status: 200, 
    description: 'Authorization URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string' },
        state: { type: 'string' }
      }
    }
  })
  async getAuthUrl(@Param('userId') userId: string) {
    return this.googleCalendarOAuthService.getAuthUrl(userId);
  }

  @Post('exchange-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange authorization code for access tokens' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokens exchanged successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        tokens: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            refresh_token: { type: 'string' },
            expires_at: { type: 'number' },
            scope: { type: 'string' },
            token_type: { type: 'string' }
          }
        }
      }
    }
  })
  async exchangeTokens(@Body() exchangeDto: GoogleTokenExchangeDto) {
    return this.googleCalendarOAuthService.exchangeCodeForTokens(
      exchangeDto.code,
      exchangeDto.state
    );
  }

  @Get('auth-status/:userId')
  @ApiOperation({ summary: 'Check user Google Calendar authentication status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Authentication status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        isAuthenticated: { type: 'boolean' },
        needsRefresh: { type: 'boolean' },
        expiresAt: { type: 'number' },
        scopes: { type: 'array', items: { type: 'string' } }
      }
    }
  })
  async getAuthStatus(@Param('userId') userId: string) {
    return this.googleCalendarOAuthService.getAuthStatus(userId);
  }

  @Post('refresh-token/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh user access token' })
  @ApiResponse({ 
    status: 200, 
    description: 'Token refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        refresh_token: { type: 'string' },
        expires_at: { type: 'number' },
        scope: { type: 'string' },
        token_type: { type: 'string' }
      }
    }
  })
  async refreshToken(@Param('userId') userId: string) {
    return this.googleCalendarOAuthService.refreshAccessToken(userId);
  }

  @Get('valid-token/:userId')
  @ApiOperation({ summary: 'Get valid access token (refreshes if needed)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Valid access token retrieved',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' }
      }
    }
  })
  async getValidToken(@Param('userId') userId: string) {
    const accessToken = await this.googleCalendarOAuthService.getValidAccessToken(userId);
    return { access_token: accessToken };
  }

  @Delete('revoke/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke user Google Calendar access' })
  @ApiResponse({ 
    status: 200, 
    description: 'Tokens revoked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' }
      }
    }
  })
  async revokeTokens(@Param('userId') userId: string) {
    return this.googleCalendarOAuthService.revokeUserTokens(userId);
  }

  @Get('users')
  @ApiOperation({ summary: 'Get all users with Google Calendar tokens (admin only)' })
  @ApiResponse({ 
    status: 200, 
    description: 'User tokens retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          expiresAt: { type: 'number' },
          scopes: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  })
  async getAllUserTokens() {
    return this.googleCalendarOAuthService.findAllUserTokens();
  }
}