import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });

    this.logger.log('Google OAuth strategy initialized');
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback
  ): Promise<any> {
    this.logger.debug(`Processing Google OAuth profile: ${profile.id}`);

    const { id, name, emails, photos } = profile;

    // Extract the email and profile data
    const email = emails && emails.length > 0 ? emails[0].value : null;
    const firstName = name?.givenName || '';
    const lastName = name?.familyName || '';
    const avatar = photos && photos.length > 0 ? photos[0].value : null;

    if (!email) {
      this.logger.warn(`No email provided in Google profile for user ${id}`);
    }

    try {
      // Use the auth service to find or create a user with this OAuth profile
      const user = await this.authService.findOrCreateOAuthUser({
        providerId: id,
        provider: 'google',
        email,
        firstName,
        lastName,
        avatar,
      });

      this.logger.debug(`User ${user.id} authenticated via Google OAuth`);
      done(null, user);
    } catch (error) {
      this.logger.error(
        `Error during Google authentication: ${error.message}`,
        error.stack
      );
      done(error, null);
    }
  }
}
