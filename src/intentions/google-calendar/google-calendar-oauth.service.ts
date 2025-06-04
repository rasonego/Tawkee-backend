import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import * as crypto from 'crypto';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

export interface GoogleAuthUrlResponse {
  authUrl: string;
  state: string;
}

export interface GoogleAuthStatus {
  isAuthenticated: boolean;
  needsRefresh?: boolean;
  expiresAt?: number;
  scopes?: string[];
}

export interface TokenExchangeResponse {
  success: boolean;
  tokens?: GoogleTokens;
  error?: string;
}

@Injectable()
export class GoogleCalendarOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateSecret: string;
  private readonly scopes: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    this.stateSecret = this.configService.get<string>('GOOGLE_STATE_SECRET');
    
    this.scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'openid',
      'email',
      'profile'
    ];

    if (!this.clientId || !this.clientSecret || !this.redirectUri || !this.stateSecret) {
      throw new Error('Missing required Google OAuth configuration');
    }
  }

  async getAuthUrl(userId: string): Promise<GoogleAuthUrlResponse> {
    // Ensure user exists
    await this.usersService.findOne(userId);

    const state = this.generateState(userId);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    return {
      authUrl,
      state,
    };
  }

  async refreshAccessToken(userId: string): Promise<GoogleTokens> {
    // Ensure user exists
    await this.usersService.findOne(userId);

    const storedTokens = await this.getUserTokens(userId);
    
    if (!storedTokens || !storedTokens.refresh_token) {
      throw new UnauthorizedException('No refresh token available. User needs to re-authenticate.');
    }

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: storedTokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        
        // If refresh token is invalid, user needs to re-authenticate
        if (response.status === 400 && errorData.error === 'invalid_grant') {
          await this.revokeUserTokens(userId);
          throw new UnauthorizedException('Refresh token expired. User needs to re-authenticate.');
        }
        
        throw new BadRequestException(`Token refresh failed: ${errorData.error_description || response.status}`);
      }

      const tokenData = await response.json();
      
      const updatedTokens: GoogleTokens = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || storedTokens.refresh_token, // Keep old refresh token if new one not provided
        expires_at: Date.now() + (tokenData.expires_in * 1000),
        scope: tokenData.scope || storedTokens.scope,
        token_type: tokenData.token_type || storedTokens.token_type,
      };

      // Update stored tokens
      await this.storeUserTokens(userId, updatedTokens);

      return updatedTokens;
    } catch (error) {
      console.error('Error refreshing access token:', error);
      throw error;
    }
  }

  async getValidAccessToken(userId: string): Promise<string> {
    // Ensure user exists
    await this.usersService.findOne(userId);

    const tokens = await this.getUserTokens(userId);
    
    if (!tokens) {
      throw new UnauthorizedException('User not authenticated with Google Calendar');
    }

    // Check if token is expired (with 5-minute buffer)
    const expiresAt = tokens.expires_at || 0;
    const now = Date.now();
    const buffer = 5 * 60 * 1000; // 5 minutes

    if (now + buffer >= expiresAt) {
      // Token is expired or will expire soon, refresh it
      const refreshedTokens = await this.refreshAccessToken(userId);
      return refreshedTokens.access_token;
    }

    return tokens.access_token;
  }

  async getAuthStatus(userId: string): Promise<GoogleAuthStatus> {
    try {
      // Ensure user exists
      await this.usersService.findOne(userId);

      const tokens = await this.getUserTokens(userId);
      
      if (!tokens || !tokens.access_token) {
        return { isAuthenticated: false };
      }

      // Check if token is expired
      const expiresAt = tokens.expires_at || 0;
      const now = Date.now();
      
      if (now >= expiresAt) {
        return {
          isAuthenticated: true,
          needsRefresh: true,
          expiresAt: tokens.expires_at,
          scopes: tokens.scope ? tokens.scope.split(' ') : [],
        };
      }

      // Verify token is still valid by making a test API call
      try {
        const testResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
          },
        });

        return {
          isAuthenticated: testResponse.ok,
          needsRefresh: testResponse.status === 401,
          expiresAt: tokens.expires_at,
          scopes: tokens.scope ? tokens.scope.split(' ') : [],
        };
      } catch (error) {
        return {
          isAuthenticated: false,
          needsRefresh: true,
          expiresAt: tokens.expires_at,
          scopes: tokens.scope ? tokens.scope.split(' ') : [],
        };
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      return { isAuthenticated: false };
    }
  }

  async revokeUserTokens(userId: string): Promise<{ success: boolean }> {
    try {
      // Ensure user exists
      await this.usersService.findOne(userId);

      const tokens = await this.getUserTokens(userId);
      
      if (tokens && tokens.access_token) {
        // Revoke token with Google
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
        } catch (error) {
          console.warn('Error revoking token with Google:', error);
          // Continue with local cleanup even if Google revocation fails
        }
      }

      // Remove tokens from database
      await this.prisma.userGoogleToken.delete({
        where: { userId },
      });

      return { success: true };
    } catch (error) {
      if (error.code === 'P2025') { // Prisma record not found
        return { success: true }; // Already revoked
      }
      console.error('Error revoking user tokens:', error);
      throw error;
    }
  }

  async findAllUserTokens(): Promise<Array<{ userId: string; expiresAt: number; scopes: string[] }>> {
    const tokens = await this.prisma.userGoogleToken.findMany({
      select: {
        userId: true,
        expiresAt: true,
        scope: true,
      },
    });

    return tokens.map(token => ({
      userId: token.userId,
      expiresAt: Number(token.expiresAt),
      scopes: token.scope.split(' '),
    }));
  }

  // Private helper methods
  private generateState(userId: string): string {
    const timestamp = Date.now();
    const payload = JSON.stringify({ userId, timestamp });
    const signature = crypto
      .createHmac('sha256', this.stateSecret)
      .update(payload)
      .digest('hex');
    
    return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
  }

  private async storeUserTokens(userId: string, tokens: GoogleTokens): Promise<void> {
    const encryptedAccessToken = this.encryptToken(tokens.access_token);
    const encryptedRefreshToken = tokens.refresh_token 
      ? this.encryptToken(tokens.refresh_token) 
      : null;

    await this.prisma.userGoogleToken.upsert({
      where: { userId },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: tokens.expires_at,
        scope: tokens.scope,
        tokenType: tokens.token_type,
        updatedAt: new Date(),
      },
      create: {
        userId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: tokens.expires_at,
        scope: tokens.scope,
        tokenType: tokens.token_type,
      },
    });
  }

  private async getUserTokens(userId: string): Promise<GoogleTokens | null> {
    try {
      const tokenRecord = await this.prisma.userGoogleToken.findUnique({
        where: { userId },
      });

      if (!tokenRecord) {
        return null;
      }

      return {
        access_token: this.decryptToken(tokenRecord.accessToken),
        refresh_token: tokenRecord.refreshToken 
          ? this.decryptToken(tokenRecord.refreshToken) 
          : null,
        expires_at: Number(tokenRecord.expiresAt),
        scope: tokenRecord.scope,
        token_type: tokenRecord.tokenType,
      };
    } catch (error) {
      console.error('Error retrieving user tokens:', error);
      return null;
    }
  }

  private encryptToken(token: string): string {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.stateSecret, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAAD(Buffer.from('google-token'));

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');

    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.stateSecret, 'salt', 32);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAAD(Buffer.from('google-token'));
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}