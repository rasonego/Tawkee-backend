import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly sender: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.error('RESEND_API_KEY is not defined');
    }
    this.resend = new Resend(apiKey);
    this.sender =
      this.configService.get<string>('EMAIL_SENDER') || 'noreply@tawkee.io';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  async sendVerificationEmail(
    to: string,
    verificationToken: string,
    name: string
  ): Promise<boolean> {
    try {
      const verificationUrl = `${this.frontendUrl}/verify-email?token=${verificationToken}`;

      const { data, error } = await this.resend.emails.send({
        from: this.sender,
        to,
        subject: 'Verify Your Email Address',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #333;">Welcome to Tawkee!</h2>
            <p>Hi ${name},</p>
            <p>Thank you for registering with Tawkee. Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email</a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p><a href="${verificationUrl}">${verificationUrl}</a></p>
            <p>If you did not register for a Tawkee account, please ignore this email.</p>
            <p>Thank you,<br>The Tawkee Team</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send verification email: ${error.message}`
        );
        return false;
      }

      this.logger.log(`Verification email sent to ${to} with ID: ${data?.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending verification email: ${error.message}`);
      return false;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    name: string
  ): Promise<boolean> {
    try {
      const resetUrl = `${this.frontendUrl}/reset-password?token=${resetToken}`;

      const { data, error } = await this.resend.emails.send({
        from: this.sender,
        to,
        subject: 'Reset Your Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #333;">Password Reset Request</h2>
            <p>Hi ${name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
            </div>
            <p>Or copy and paste this link in your browser:</p>
            <p><a href="${resetUrl}">${resetUrl}</a></p>
            <p>If you did not request a password reset, please ignore this email.</p>
            <p>Thank you,<br>The Tawkee Team</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(
          `Failed to send password reset email: ${error.message}`
        );
        return false;
      }

      this.logger.log(
        `Password reset email sent to ${to} with ID: ${data?.id}`
      );
      return true;
    } catch (error) {
      this.logger.error(`Error sending password reset email: ${error.message}`);
      return false;
    }
  }

  async sendTestEmail(to: string): Promise<boolean> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: this.sender,
        to,
        subject: 'Test Email from Tawkee',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #333;">Test Email</h2>
            <p>This is a test email from Tawkee.</p>
            <p>If you're seeing this, email sending is configured correctly!</p>
            <p>Thank you,<br>The Tawkee Team</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(`Failed to send test email: ${error.message}`);
        return false;
      }

      this.logger.log(`Test email sent to ${to} with ID: ${data?.id}`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending test email: ${error.message}`);
      return false;
    }
  }
}
