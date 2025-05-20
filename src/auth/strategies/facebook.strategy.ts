import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  private readonly logger = new Logger(FacebookStrategy.name);

  constructor(
    private configService: ConfigService,
    private authService: AuthService
  ) {
    super({
      clientID: configService.get<string>('FACEBOOK_APP_ID'),
      clientSecret: configService.get<string>('FACEBOOK_APP_SECRET'),
      callbackURL: configService.get<string>('FACEBOOK_CALLBACK_URL'),
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
      scope: ['email'],
    });

    this.logger.log('Facebook OAuth strategy initialized');
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (error: any | null, user: any | null) => unknown
  ): Promise<any> {
    this.logger.debug(`Processing Facebook OAuth profile: ${profile.id}`);

    const { id, name, emails, photos } = profile;

    // Extract the email and profile data
    const email = emails && emails.length > 0 ? emails[0].value : null;
    const firstName = name?.givenName || '';
    const lastName = name?.familyName || '';
    const avatar = photos && photos.length > 0 ? photos[0].value : null;

    if (!email) {
      this.logger.warn(`No email provided in Facebook profile for user ${id}`);
    }

    try {
      // Use the auth service to find or create a user with this OAuth profile
      const user = await this.authService.findOrCreateOAuthUser({
        providerId: id,
        provider: 'facebook',
        email,
        firstName,
        lastName,
        avatar,
      });

      this.logger.debug(`User ${user.id} authenticated via Facebook OAuth`);
      done(null, user);
    } catch (error) {
      this.logger.error(
        `Error during Facebook authentication: ${error.message}`,
        error.stack
      );
      done(error, null);
    }
  }
}
