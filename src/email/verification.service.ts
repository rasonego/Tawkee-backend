import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly tokenExpirationHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {
    // Get token expiration time from config or use default (24 hours)
    this.tokenExpirationHours =
      Number(this.configService.get<string>('TOKEN_EXPIRATION_HOURS')) || 24;
  }

  /**
   * Generate a verification token for a user and send a verification email
   * @param userId User ID to generate token for
   * @returns Boolean indicating success or failure
   */
  async sendVerificationEmail(userId: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (user.emailVerified) {
        this.logger.log(`Email already verified for user ${userId}`);
        return true;
      }

      // Generate a random token
      const token = this.generateToken();
      const expires = new Date();
      expires.setHours(expires.getHours() + this.tokenExpirationHours);

      // Update user with verification token using Prisma's type-safe API
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          verificationToken: token,
          verificationExpires: expires,
        },
      });

      // Send verification email
      const success = await this.emailService.sendVerificationEmail(
        user.email,
        token,
        user.name
      );

      if (!success) {
        this.logger.error(`Failed to send verification email to ${user.email}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error in sendVerificationEmail: ${error.message}`);
      return false;
    }
  }

  /**
   * Verify a user's email using a verification token
   * @param token Verification token
   * @returns User ID if verification successful
   */
  async verifyEmail(token: string): Promise<string> {
    // Find user with this token using Prisma's type-safe API
    const currentDate = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationExpires: {
          gte: currentDate,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // If email is already verified, just return the user ID
    if (user.emailVerified) {
      this.logger.log(
        `Email already verified for user ${user.id} using token ${token}`
      );
      return user.id;
    }

    // Set token to expire in 5 minutes (instead of removing it immediately)
    const tokenRemovalTime = new Date();
    tokenRemovalTime.setMinutes(tokenRemovalTime.getMinutes() + 5);

    // Update user to mark email as verified but keep the token temporarily
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        // Update expiration time to 5 minutes from now
        verificationExpires: tokenRemovalTime,
      },
    });

    this.logger.log(
      `Email verified for user ${user.id}, token will expire at ${tokenRemovalTime.toISOString()}`
    );

    // Schedule token removal after 5 minutes
    setTimeout(
      async () => {
        try {
          await this.removeVerificationToken(user.id, token);
        } catch (error) {
          this.logger.error(
            `Failed to remove verification token for user ${user.id}: ${error.message}`
          );
        }
      },
      5 * 60 * 1000
    ); // 5 minutes in milliseconds

    return user.id;
  }

  /**
   * Remove verification token for a user
   * @param userId User ID
   * @param token Verification token to verify before removal
   */
  private async removeVerificationToken(
    userId: string,
    token: string
  ): Promise<void> {
    try {
      // Double-check that this is still the current token before removing
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          verificationToken: token,
        },
      });

      if (!user) {
        this.logger.log(
          `Token ${token} for user ${userId} already removed or changed`
        );
        return;
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          verificationToken: null,
          verificationExpires: null,
        },
      });

      this.logger.log(`Removed verification token for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error removing verification token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scheduled task to clean up expired tokens
   * Can be called periodically to ensure all expired tokens are removed
   */
  @Cron('0 */30 * * * *') // Run every 30 minutes
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const currentDate = new Date();

      const result = await this.prisma.user.updateMany({
        where: {
          verificationExpires: {
            lt: currentDate,
          },
          verificationToken: {
            not: null,
          },
        },
        data: {
          verificationToken: null,
          verificationExpires: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired verification tokens`
        );
      }
    } catch (error) {
      this.logger.error(`Error cleaning up expired tokens: ${error.message}`);
    }
  }

  /**
   * Resend verification email to user
   * @param email User email to resend verification to
   * @returns Boolean indicating success or failure
   */
  async resendVerificationEmail(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerified: true,
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    return this.sendVerificationEmail(user.id);
  }

  /**
   * Generate a random token for verification
   * @returns Random token string
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }
}
