import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import { google, Auth } from 'googleapis';

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

@Injectable()
export class GoogleCalendarOAuthService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateSecret: string;
  private readonly scopes: string[];
  private readonly oauth2Client: Auth.OAuth2Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    this.stateSecret = this.configService.get<string>('GOOGLE_STATE_SECRET');

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    this.scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.freebusy',
      'https://www.googleapis.com/auth/calendar.freebusy',     
      'openid', 'email', 'profile',
    ];

    if (!this.clientId || !this.clientSecret || !this.redirectUri || !this.stateSecret) {
      throw new Error('Missing required Google OAuth configuration');
    }
  }

  async getAuthUrl(agentId: string): Promise<{ authUrl: string, state: string }> {
    // Ensure the agent exists before performing the upsert
    const agentExists = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });

    if (!agentExists) {
      console.error(`Agent with ID ${agentId} does not exist. Aborting auth URL generation.`);
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    const state = this.generateState(agentId);
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent',
      state,
    });
    return { authUrl, state };
  }

  async exchangeCodeForTokens(code: string, state: string) {
    const agentId = this.verifyState(state);

    const { tokens } = await this.oauth2Client.getToken(code);
    const expires_at = tokens.expiry_date ?? (Date.now() + 3600 * 1000);

    const googleTokens: GoogleTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at,
      scope: tokens.scope ?? this.scopes.join(' '),
      token_type: tokens.token_type ?? 'Bearer',
    };

    await this.storeAgentTokens(agentId, googleTokens);
    return googleTokens;
  }

  async getAuthStatus(agentId: string): Promise<{
    isAuthenticated: boolean;
    needsRefresh?: boolean;
    expiresAt?: number;
    scopes?: string[];
  }> {
    const tokens = await this.getAgentTokens(agentId);
    if (!tokens?.access_token) return { isAuthenticated: false };

    const now = Date.now();
    const isExpired = now >= tokens.expires_at;

    if (isExpired) {
      return {
        isAuthenticated: true,
        needsRefresh: true,
        expiresAt: tokens.expires_at,
        scopes: tokens.scope?.split(' ') || [],
      };
    }

    try {
      const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      return {
        isAuthenticated: response.ok,
        needsRefresh: response.status === 401,
        expiresAt: tokens.expires_at,
        scopes: tokens.scope?.split(' ') || [],
      };
    } catch (err) {
      return {
        isAuthenticated: false,
        needsRefresh: true,
        expiresAt: tokens.expires_at,
        scopes: tokens.scope?.split(' ') || [],
      };
    }
  }

  async getValidAccessToken(agentId: string): Promise<string> {
    const tokens = await this.getAgentTokens(agentId);
    if (!tokens) throw new UnauthorizedException('Agent not authenticated.');

    const isExpired = Date.now() + 5 * 60 * 1000 >= tokens.expires_at;
    return isExpired ? (await this.refreshAccessToken(agentId)).access_token : tokens.access_token;
  }

  async refreshAccessToken(agentId: string): Promise<GoogleTokens> {
    const tokens = await this.getAgentTokens(agentId);
    if (!tokens?.refresh_token) throw new UnauthorizedException('Missing refresh token');

    this.oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });

    const res = await this.oauth2Client.refreshAccessToken();
    const refreshed = res.credentials;

    const updated: GoogleTokens = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
      expires_at: refreshed.expiry_date ?? (Date.now() + 3600 * 1000),
      scope: refreshed.scope ?? tokens.scope,
      token_type: refreshed.token_type ?? 'Bearer',
    };

    await this.storeAgentTokens(agentId, updated);
    return updated;
  }

  async findAllAgentTokens(): Promise<Array<{ agentId: string; expiresAt: number; scopes: string[] }>> {
  const tokenRecords = await this.prisma.agentGoogleToken.findMany({
    select: {
      agentId: true,
      expiresAt: true,
      scope: true,
    },
  });

  return tokenRecords.map(record => ({
    agentId: record.agentId,
    expiresAt: Number(record.expiresAt),
    scopes: record.scope.split(' '),
  }));
}
  async revokeAgentTokens(agentId: string) {
    const tokens = await this.getAgentTokens(agentId);
    if (tokens?.access_token) await this.oauth2Client.revokeToken(tokens.access_token);
    await this.prisma.agentGoogleToken.deleteMany({ where: { agentId } });
    return { success: true };
  }

  private generateState(agentId: string): string {
    const timestamp = Date.now();
    const payload = JSON.stringify({ agentId, timestamp });
    const signature = crypto.createHmac('sha256', this.stateSecret).update(payload).digest('hex');
    return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
  }

  private verifyState(state: string): string {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    const { payload, signature } = decoded;
    const expected = crypto.createHmac('sha256', this.stateSecret).update(payload).digest('hex');
    if (expected !== signature) throw new BadRequestException('Invalid state signature');

    const { agentId, timestamp } = JSON.parse(payload);
    if (Date.now() - timestamp > 3600000) throw new BadRequestException('State expired');

    return agentId;
  }

  private async storeAgentTokens(agentId: string, tokens: GoogleTokens) {
    // Ensure the agent exists before performing the upsert
    const agentExists = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });

    if (!agentExists) {
      console.error(`Agent with ID ${agentId} does not exist. Aborting token storage.`);
      throw new Error(`Agent with ID ${agentId} not found`);
    }

    const encryptedAccess = this.encryptToken(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? this.encryptToken(tokens.refresh_token) : null;

    await this.prisma.agentGoogleToken.upsert({
      where: { agentId },
      update: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt: tokens.expires_at,
        scope: tokens.scope,
        tokenType: tokens.token_type,
      },
      create: {
        agentId,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt: tokens.expires_at,
        scope: tokens.scope,
        tokenType: tokens.token_type,
      },
    });
  }

  private async getAgentTokens(agentId: string): Promise<GoogleTokens | null> {
    const record = await this.prisma.agentGoogleToken.findUnique({ where: { agentId } });
    if (!record) return null;
    return {
      access_token: this.decryptToken(record.accessToken),
      refresh_token: record.refreshToken ? this.decryptToken(record.refreshToken) : null,
      expires_at: Number(record.expiresAt),
      scope: record.scope,
      token_type: record.tokenType,
    };
  }

  private encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.stateSecret, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('google-token'));
    const enc = cipher.update(token, 'utf8', 'hex') + cipher.final('hex');
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
  }

  private decryptToken(data: string): string {
    const [ivHex, tagHex, enc] = data.split(':');
    const key = crypto.scryptSync(this.stateSecret, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAAD(Buffer.from('google-token'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
  }
}
