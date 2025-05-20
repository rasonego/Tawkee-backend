import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Check if token is blacklisted using Prisma's type-safe API
    // Wrapped in try-catch to handle database connection issues gracefully
    let isBlacklisted = false;
    try {
      const blacklistedToken = await this.prisma.blacklistedToken.findUnique({
        where: { token },
      });

      // If token is found in the blacklist, deny access
      if (blacklistedToken) {
        isBlacklisted = true;
      }
    } catch (error) {
      // If we can't check the blacklist due to DB issues, we'll proceed anyway
      // but log the error for monitoring purposes
      console.error(
        'Database error when checking blacklisted token:',
        error.message
      );
    }

    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      // Make sure payload contains the required userId
      if (!payload || !payload.userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // Attach user to request for later use with additional sub field
      request['user'] = {
        ...payload,
        sub: payload.userId, // Ensure sub is set for compatibility
      };

      // Also attach the raw token for potential blacklisting on logout
      request['token'] = token;
    } catch (error) {
      throw new UnauthorizedException(`Invalid token: ${error}`);
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
