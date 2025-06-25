import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

/**
 * Interface for OAuth profile data
 */
interface OAuthUserData {
  providerId: string;
  provider: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * Scheduled task to clean up expired tokens from the database
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredTokens() {
    const now = new Date();

    try {
      // Delete all blacklisted tokens that have expired using Prisma's type-safe API
      const result = await this.prisma.blacklistedToken.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });

      const count = result.count;

      this.logger.log(`Cleaned up ${count} expired tokens from blacklist`);
    } catch (error) {
      this.logger.error(`Error cleaning up expired tokens: ${error.message}`);
    }
  }

  /**
   * Find an existing user by OAuth provider details or create a new one
   * @param userData OAuth user data from provider
   * @returns User object
   */
  async findOrCreateOAuthUser(userData: OAuthUserData) {
    const { providerId, provider, email, firstName, lastName, avatar } =
      userData;

    this.logger.debug(
      `Looking for user with ${provider} providerId: ${providerId}`
    );

    // Try to find user by provider and providerId first
    let user = null;

    if (provider === 'google') {
      user = await this.prisma.user.findUnique({
        where: { googleId: providerId },
      });
    } else if (provider === 'facebook') {
      user = await this.prisma.user.findUnique({
        where: { facebookId: providerId },
      });
    }

    // If not found by provider ID, try to find by email
    if (!user && email) {
      this.logger.debug(`User not found by providerId, trying email: ${email}`);
      user = await this.prisma.user.findUnique({
        where: { email },
      });

      // If found by email, update the user with OAuth info
      if (user) {
        this.logger.debug(
          `Found user by email, updating with ${provider} providerId`
        );

        const updateData: any = {
          provider,
          providerId,
          avatar: avatar || user.avatar,
          emailVerified: true,
        };

        // Set specific provider ID field based on the provider
        if (provider === 'google') {
          updateData.googleId = providerId;
        } else if (provider === 'facebook') {
          updateData.facebookId = providerId;
        }

        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }

    // If still not found, create a new user
    if (!user) {
      this.logger.debug(
        `No existing user found, creating new user with ${provider} authentication`
      );

      // Generate a unique username from email or provider+providerId
      const baseUsername = email
        ? email.split('@')[0]
        : `${provider}_${providerId.substring(0, 8)}`;

      const username = await this.generateUniqueUsername(baseUsername);

      // Create a workspace first
      const workspace = await this.prisma.workspace.create({
        data: {
          name: `${firstName || 'New'}'s Workspace`,
        },
      });

      const plan = await this.prisma.plan.findFirst({
        where: {
          isActive: true,
          isEnterprise: false,
          trialDays: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          stripePriceId: true,
          description: true,
          features: true,
          creditsLimit: true,
          agentLimit: true,
          trainingTextLimit: true,
          trainingWebsiteLimit: true,
          trainingVideoLimit: true,
          trainingDocumentLimit: true,
          isEnterprise: true,
          trialDays: true,
        },
      });

      if (!plan) throw new Error('No valid public trial plan found');

      const now = new Date();
      const trialEnd = new Date(
        now.getTime() + (plan.trialDays ?? 14) * 86400000
      );

      await this.prisma.subscription.create({
        data: {
          workspaceId: workspace.id,
          planId: plan.id,
          stripeSubscriptionId: 'trial-local',
          stripeCustomerId: 'trial-local',
          status: 'TRIAL',
          currentPeriodStart: now,
          currentPeriodEnd: trialEnd,
          trialStart: now,
          trialEnd: trialEnd,
        },
      });

      await this.prisma.smartRechargeSetting.create({
        data: {
          workspaceId: workspace.id,
          threshold: 1000,
          rechargeAmount: 1000,
          active: false,
        },
      });

      // Prepare user creation data
      const userData: any = {
        email,
        name: `${firstName || ''} ${lastName || ''}`.trim() || username,
        firstName: firstName || '',
        lastName: lastName || '',
        provider,
        providerId,
        avatar,
        emailVerified: true,
        workspaceId: workspace.id,
      };

      // Set specific provider ID field based on the provider
      if (provider === 'google') {
        userData.googleId = providerId;
      } else if (provider === 'facebook') {
        userData.facebookId = providerId;
      }

      // Create the new user
      user = await this.prisma.user.create({
        data: userData,
      });

      this.logger.debug(
        `Created new user ${user.id} with ${provider} authentication`
      );
    }

    return user;
  }

  /**
   * Generate a JWT token for the authenticated user
   * @param user User object
   * @returns JWT token string
   */
  generateJwtToken(user: any) {
    const payload = {
      sub: user.id,
      userId: user.id, // Add userId for compatibility with AuthGuard
      email: user.email,
      name: user.name,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Helper to generate a unique username
   * @param baseUsername Base username to start with
   * @returns Unique username
   */
  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    let username = baseUsername;
    let count = 0;
    let isUnique = false;

    while (!isUnique) {
      const existing = await this.prisma.user.findFirst({
        where: {
          name: username,
        },
      });

      if (!existing) {
        isUnique = true;
      } else {
        count++;
        username = `${baseUsername}${count}`;
      }

      // Safety check to prevent infinite loops
      if (count > 100) {
        username = `${baseUsername}_${Date.now()}`;
        isUnique = true;
      }
    }

    return username;
  }
}
