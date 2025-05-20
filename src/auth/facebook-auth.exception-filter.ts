import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  UnauthorizedException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Catch(UnauthorizedException)
export class FacebookAuthExceptionFilter implements ExceptionFilter {
  constructor(private readonly configService: ConfigService) {}

  catch(exception: UnauthorizedException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Check if this is a Facebook callback route
    if (request.url && request.url.startsWith('/auth/facebook/callback')) {
      console.log('Facebook authentication failed:', exception.message);

      // Get the frontend URL from config
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3000';

      // Redirect to frontend with error info instead of showing 401
      return response.redirect(
        HttpStatus.FOUND,
        `${frontendUrl}/auth/oauth-result?error=authentication_failed&reason=${encodeURIComponent('Authentication canceled or failed')}`
      );
    }

    // For other unauthorized exceptions, proceed with normal error handling
    response.status(HttpStatus.UNAUTHORIZED).json({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: exception.message || 'Unauthorized',
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
