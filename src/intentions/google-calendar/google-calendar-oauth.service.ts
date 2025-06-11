import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import { google, Auth } from 'googleapis';
import { IntentionsService } from '../intentions.service';
import { ScheduleValidationService } from './schedule-validation/schedule-validation.service';

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
    private readonly intentionsService: IntentionsService,
    private readonly scheduleValidationService: ScheduleValidationService
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

  private base64UrlEncode(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-') // URL-safe replacements
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  getSocialLoginAuthUrl(): { authUrl: string; state: string } {
    const payloadObj = {
      type: 'social-login',
      nonce: this.generateNonce(),
      timestamp: Date.now(),
    };
    
    // Stringify payload first
    const payloadString = JSON.stringify(payloadObj);
    
    // Generate signature from stringified payload
    const signature = this.generateSignature(payloadString);
    
    // Compose state object with string payload
    const stateObject = { payload: payloadString, signature };
    
    // Base64 encode state JSON string
    const state = Buffer.from(JSON.stringify(stateObject)).toString('base64');

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'consent',
      state,
    });

    return { authUrl, state };
  }

  generateNonce(length = 16): string {
    // Generate `length` bytes of cryptographically strong random data, then hex encode it
    return crypto.randomBytes(length).toString('hex');
  }

  generateSignature(payloadString: string): string {
    const secret = this.configService.get<string>('STATE_SIGNING_SECRET') || 'victorx';

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payloadString);

    return hmac.digest('hex');
  }

  verifySignature(payloadString: string, signature: string): boolean {
    const expected = this.generateSignature(payloadString);
    return expected === signature;
  }

  async getCalendarAuthUrl(agentId: string): Promise<{ authUrl: string; state: string }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });

    if (!agent) {
      throw new BadRequestException(`Agent with ID ${agentId} not found`);
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

  async exchangeCodeForTokens(code: string, state: string): Promise<string> {
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

    // Set the access token for user info call
    this.oauth2Client.setCredentials({ access_token: tokens.access_token });

    // Fetch user email using Google OAuth2 API
    const oauth2 = google.oauth2({
      auth: this.oauth2Client,
      version: 'v2',
    });

    const userinfoResponse = await oauth2.userinfo.get();

    const email = userinfoResponse?.data?.email;

    if (!email) {
      throw new UnauthorizedException('Failed to retrieve email for authorized calendar account');
    }

    await this.storeAgentTokens(agentId, googleTokens);

    return email;
  }

  async exchangeSocialLoginCode(
    code: string,
    statePayload: { type: string; nonce: string; timestamp: number }
  ): Promise<{
    tokens: GoogleTokens;
    profile: {
      email: string;
      name: string;
      picture: string;
      sub: string;
    };
  }> {
    // Validate the state payload structure
    if (!statePayload || statePayload.type !== 'social-login') {
      throw new BadRequestException('Invalid state for social login');
    }

    // Optionally, you can add nonce or timestamp validation here for extra security

    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);
    const expires_at = tokens.expiry_date ?? (Date.now() + 3600 * 1000);

    const googleTokens: GoogleTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at,
      scope: tokens.scope ?? 'openid email profile',
      token_type: tokens.token_type ?? 'Bearer',
    };

    // Set the access token on the client for subsequent API calls
    this.oauth2Client.setCredentials({ access_token: tokens.access_token });

    // Use Google's OpenID endpoint to fetch profile info
    const oauth2 = google.oauth2({
      auth: this.oauth2Client,
      version: 'v2',
    });

    const userinfoResponse = await oauth2.userinfo.get();

    if (!userinfoResponse?.data?.email) {
      throw new UnauthorizedException('Failed to retrieve user profile from Google');
    }

    return {
      tokens: googleTokens,
      profile: {
        email: userinfoResponse.data.email,
        name: userinfoResponse.data.name,
        picture: userinfoResponse.data.picture,
        sub: userinfoResponse.data.id,
      },
    };
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

    await this.intentionsService.removeGoogleCalendarIntentions(agentId);
    await this.scheduleValidationService.updateScheduleSettings(agentId, { email: '' });

    return { success: true };
  }

  private generateState(agentId: string): string {
    const timestamp = Date.now();
    const payloadObj = { agentId, timestamp };
    const payloadString = JSON.stringify(payloadObj);

    // Use generateSignature expecting a string payload
    const signature = this.generateSignature(payloadString);

    const stateObject = { payload: payloadString, signature };
    const encodedState = Buffer.from(JSON.stringify(stateObject)).toString('base64');

    // Logging
    // console.log('--- Generating OAuth State ---');
    // console.log('Agent ID:', agentId);
    // console.log('Timestamp:', timestamp);
    // console.log('Payload (stringified):', payloadString);
    // console.log('Generated Signature:', signature);
    // console.log('Encoded State:', encodedState);

    return encodedState;
  }

  private verifyState(state: string): string {
    try {
      const decodedState = Buffer.from(state, 'base64').toString();
      const { payload, signature } = JSON.parse(decodedState);

      if (!payload || !signature) {
        throw new BadRequestException('Invalid state structure');
      }

      const expectedSignature = this.generateSignature(payload);

      // Logging
      // console.log('--- Verifying OAuth State ---');
      // console.log('Decoded State:', decodedState);
      // console.log('Payload (stringified):', payload);
      // console.log('Provided Signature:', signature);
      // console.log('Expected Signature:', expectedSignature);

      if (signature !== expectedSignature) {
        throw new BadRequestException('Invalid state signature');
      }

      const parsedPayload = JSON.parse(payload);
      const { agentId, timestamp } = parsedPayload;

      if (Date.now() - timestamp > 1000 * 60 * 60) {
        throw new BadRequestException('State expired');
      }

      return agentId;
    } catch (err) {
      console.error('Failed to verify state:', err);
      throw new BadRequestException('Invalid state format');
    }
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
