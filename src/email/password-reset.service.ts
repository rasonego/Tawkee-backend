import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Cron } from '@nestjs/schedule';

const scryptAsync = promisify(scrypt);

import { IsString, MinLength } from 'class-validator';

export class UpdatePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters long' })
  newPassword: string;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly tokenExpirationHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService
  ) {
    // Get token expiration time from config or use default (1 hour for password reset)
    this.tokenExpirationHours =
      Number(this.configService.get<string>('RESET_TOKEN_EXPIRATION_HOURS')) ||
      1;
  }

  /**
   * Generate a password reset token and send the reset email
   * @param email Email of the user requesting password reset
   * @returns Boolean indicating success or failure
   */
  async sendPasswordResetEmail(email: string): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // For security reasons, we don't want to reveal whether an email exists or not
        this.logger.warn(
          `Password reset requested for non-existent email: ${email}`
        );
        return true; // Return true to prevent email enumeration
      }

      // For OAuth users without a password, we cannot reset their password
      if (!user.password) {
        this.logger.warn(
          `Password reset requested for OAuth user without password: ${email}`
        );
        throw new BadRequestException(
          'This account uses social login and does not have a password to reset'
        );
      }

      // Generate a random token
      const token = this.generateToken();
      const expires = new Date();
      expires.setHours(expires.getHours() + this.tokenExpirationHours);

      // Update user with reset token
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: token,
          resetExpires: expires,
        },
      });

      // Send password reset email
      const success = await this.emailService.sendPasswordResetEmail(
        user.email,
        token,
        user.name
      );

      if (!success) {
        this.logger.error(
          `Failed to send password reset email to ${user.email}`
        );
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error; // Rethrow specific exceptions
      }
      this.logger.error(`Error in sendPasswordResetEmail: ${error.message}`);
      return false;
    }
  }

  /**
   * Reset a user's password using a reset token
   * @param token Reset token
   * @param newPassword New password
   * @returns User ID if reset successful
   */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    // Find user with this token
    const currentDate = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: {
          gte: currentDate,
        },
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash the new password
    const hashedPassword = await this.hashPassword(newPassword);

    // Set token to expire in 5 minutes (instead of removing it immediately)
    const tokenRemovalTime = new Date();
    tokenRemovalTime.setMinutes(tokenRemovalTime.getMinutes() + 5);

    // Update user with new password and mark token for delayed cleanup
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        // Update expiration time to 5 minutes from now
        resetExpires: tokenRemovalTime,
      },
    });

    this.logger.log(
      `Password reset for user ${user.id}, token will expire at ${tokenRemovalTime.toISOString()}`
    );

    // Schedule token removal after 5 minutes
    setTimeout(
      async () => {
        try {
          await this.removeResetToken(user.id, token);
        } catch (error) {
          this.logger.error(
            `Failed to remove reset token for user ${user.id}: ${error.message}`
          );
        }
      },
      5 * 60 * 1000
    ); // 5 minutes in milliseconds

    return user.id;
  }

  /**
   * Update a user's password if currentPassword is provided
   * @param currentPassword Current password
   * @param newPassword New password
   * @returns User ID if reset successful
   */
  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        email: true,
      },
    });

    if (!user || !user.password) {
      throw new BadRequestException('User not found or password not set');
    }

    // Validate current password
    const [storedHash, salt] = user.password.split('.');
    const storedHashBuf = Buffer.from(storedHash, 'hex');
    const suppliedHashBuf = (await scryptAsync(
      currentPassword,
      salt,
      64
    )) as Buffer;

    const isValid = timingSafeEqual(storedHashBuf, suppliedHashBuf);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password using your existing utility method
    const hashedPassword = await this.hashPassword(newPassword);

    // Update the user password
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    this.logger.log(`Password updated for user ${user.id}`);

    return user.id;
  }


  /**
   * Remove reset token for a user
   * @param userId User ID
   * @param token Reset token to verify before removal
   */
  private async removeResetToken(userId: string, token: string): Promise<void> {
    try {
      // Double-check that this is still the current token before removing
      const user = await this.prisma.user.findFirst({
        where: {
          id: userId,
          resetToken: token,
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
          resetToken: null,
          resetExpires: null,
        },
      });

      this.logger.log(`Removed reset token for user ${userId}`);
    } catch (error) {
      this.logger.error(`Error removing reset token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Scheduled task to clean up expired tokens
   * This runs alongside the verification token cleanup
   */
  @Cron('15 */30 * * * *') // Run every 30 minutes, offset by 15 seconds from verification cleanup
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const currentDate = new Date();

      const result = await this.prisma.user.updateMany({
        where: {
          resetExpires: {
            lt: currentDate,
          },
          resetToken: {
            not: null,
          },
        },
        data: {
          resetToken: null,
          resetExpires: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired password reset tokens`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error cleaning up expired reset tokens: ${error.message}`
      );
    }
  }

  /**
   * Hash a password
   * @param password Plain text password
   * @returns Hashed password
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString('hex')}.${salt}`;
  }

  /**
   * Generate a random token for password reset
   * @returns Random token string
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Verify that a reset token is valid (without actually resetting the password)
   * @param token Reset token to verify
   * @returns Boolean indicating if token is valid
   */
  async verifyResetToken(token: string): Promise<boolean> {
    const currentDate = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetExpires: {
          gte: currentDate,
        },
      },
    });

    return !!user;
  }
}
