import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  HttpStatus,
  Query,
  BadRequestException,
  UseFilters,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { VerificationService } from '../email/verification.service';
import { PasswordResetService } from '../email/password-reset.service';
import { FacebookAuthExceptionFilter } from '../auth/facebook-auth.exception-filter';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetTokenDto } from './dto/verify-reset-token.dto';
import { GoogleCalendarOAuthService } from 'src/intentions/google-calendar/google-calendar-oauth.service';

@ApiTags('auth')
@Controller('auth')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
    private readonly configService: ConfigService,
    private readonly verificationService: VerificationService,
    private readonly passwordResetService: PasswordResetService
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user with workspace' })
  @ApiResponse({
    status: 201,
    description: 'The user has been successfully created.',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User with this email already exists.',
  })
  async register(
    @Body() createUserDto: CreateUserDto
  ): Promise<{ user: UserResponseDto; token: string }> {
    const result = await this.usersService.create(createUserDto);

    // Make sure we're returning both user and token as specified in the response type
    return {
      user: result.user,
      token: result.token,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login a user' })
  @ApiResponse({
    status: 200,
    description: 'The user has been successfully logged in.',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid credentials.' })
  async login(
    @Body() loginUserDto: LoginUserDto
  ): Promise<{ user: UserResponseDto; token: string }> {
    return this.usersService.login(loginUserDto);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout a user and invalidate the token' })
  @ApiResponse({
    status: 200,
    description: 'The user has been successfully logged out.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(@Request() req): Promise<{ success: boolean }> {
    return this.usersService.logout(req.user.userId, req.token);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({
    status: 200,
    description: 'Returns the user profile.',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return this.usersService.findOne(req.user.sub);
  }

  // Initiate Google OAuth manually using googleapis
  @Get('google')
  @ApiOperation({ summary: 'Initiate Google OAuth login (manual)' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google OAuth consent screen',
  })
  async googleAuth(@Res() res) {
    const { authUrl, state } = this.googleCalendarOAuthService.getSocialLoginAuthUrl();
    return res.redirect(authUrl);
  }

  @Get('facebook')
  @UseGuards(PassportAuthGuard('facebook'))
  @ApiOperation({ summary: 'Initiate Facebook OAuth login' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Facebook for authentication',
  })
  facebookAuth() {
    // This is handled by Passport Facebook Strategy
    // The @UseGuards(AuthGuard('facebook')) redirects to Facebook OAuth
  }

  @Get('facebook/callback')
  @UseGuards(PassportAuthGuard('facebook')) //
  @UseFilters(new FacebookAuthExceptionFilter(new ConfigService()))
  @ApiOperation({ summary: 'Handle Facebook OAuth callback' })
  @ApiResponse({
    status: 302,
    description:
      'Redirects to frontend with authentication token or error message',
  })
  facebookAuthCallback(@Request() req, @Res() res) {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    if (req.query.error) {
      console.log(
        `Facebook OAuth reported an error in query parameters: ${JSON.stringify(req.query)}`
      );

      if (res.headersSent) {
        console.log(
          '[facebookAuthCallback] Headers already sent before redirecting for req.query.error. This is unexpected here.'
        );
        return;
      }
      console.log(
        `Redirecting due to req.query.error to: ${frontendUrl}/auth/oauth-result?error=...`
      );
      return res.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/auth/oauth-result?error=authentication_failed&reason=${encodeURIComponent(req.query.error_description || 'User cancelled or Facebook authentication failed')}`
      );
    }

    if (!req.user) {
      console.log(
        "[facebookAuthCallback] AuthGuard('facebook') seems to have completed, but req.user is not set, or an error was not caught by the filter. This indicates a configuration issue or an unhandled error path."
      );
      if (res.headersSent) {
        console.log(
          '[facebookAuthCallback] Headers already sent before redirecting for unexpected !req.user case.'
        );
        return;
      }
      console.log(
        `Redirecting due to !req.user to: ${frontendUrl}/auth/oauth-result?error=...`
      );
      return res.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/auth/oauth-result?error=authentication_failed&reason=${encodeURIComponent('An unexpected issue occurred during Facebook authentication.')}`
      );
    }

    console.log(
      `[facebookAuthCallback] Authentication successful via AuthGuard. User details: ${JSON.stringify(req.user)}`
    );

    const token = this.authService.generateJwtToken(req.user);

    if (res.headersSent) {
      console.log(
        '[facebookAuthCallback] Headers already sent before redirecting with token. This might indicate an issue with the filter or guard logic not terminating the request flow properly after sending a response.'
      );
      return;
    }

    console.log(
      `[facebookAuthCallback] Redirecting to frontend with JWT token: ${frontendUrl}/auth/oauth-result?token=...`
    );
    return res.redirect(
      HttpStatus.FOUND,
      `${frontendUrl}/auth/oauth-result?token=${token}`
    );
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify user email with token' })
  @ApiQuery({
    name: 'token',
    description: 'Email verification token',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Query('token') token: string) {
    try {
      if (!token) {
        throw new BadRequestException('Verification token is required');
      }

      const userId = await this.verificationService.verifyEmail(token);

      return {
        success: true,
        message: 'Email verified successfully',
        userId,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'An error occurred during verification',
      };
    }
  }

  @Post('resend-verification')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email or email already verified',
  })
  async resendVerification(
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!req.user.email) {
        throw new BadRequestException('Email is required');
      }

      const success = await this.verificationService.resendVerificationEmail(
        req.user.email
      );

      return {
        success,
        message: success
          ? 'Verification email sent successfully'
          : 'Failed to send verification email',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'An error occurred',
      };
    }
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto
  ): Promise<{ success: boolean; message: string }> {
    try {
      // For security, we always return success even if email doesn't exist
      await this.passwordResetService.sendPasswordResetEmail(
        forgotPasswordDto.email
      );

      return {
        success: true,
        message:
          'If your email is registered with us, you will receive password reset instructions shortly',
      };
    } catch (error) {
      // Only return specific error for OAuth users, otherwise always show success
      if (error instanceof BadRequestException) {
        return {
          success: false,
          message: error.message,
        };
      }

      // For any other error, still return success to prevent email enumeration
      return {
        success: true,
        message:
          'If your email is registered with us, you will receive password reset instructions shortly',
      };
    }
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.passwordResetService.resetPassword(
        resetPasswordDto.token,
        resetPasswordDto.newPassword
      );

      return {
        success: true,
        message: 'Password has been reset successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'An error occurred during password reset',
      };
    }
  }

  @Post('verify-reset-token')
  @ApiOperation({ summary: 'Verify if reset token is valid' })
  @ApiResponse({
    status: 200,
    description: 'Token verification result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
      },
    },
  })
  async verifyResetToken(
    @Body() verifyResetTokenDto: VerifyResetTokenDto
  ): Promise<{ valid: boolean }> {
    const isValid = await this.passwordResetService.verifyResetToken(
      verifyResetTokenDto.token
    );
    return { valid: isValid };
  }
}
