import {
  Injectable,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { User } from './types/user.types';
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'crypto';
import { promisify } from 'util';
import { JwtService } from '@nestjs/jwt';
import { VerificationService } from '../email/verification.service';
import { ConfigService } from '@nestjs/config';

const scryptAsync = promisify(scrypt);

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly stateSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly verificationService: VerificationService,
    private readonly configService: ConfigService
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    this.stateSecret = this.configService.get<string>('GOOGLE_STATE_SECRET');
  }

  async create(
    createUserDto: CreateUserDto
  ): Promise<{ user: UserResponseDto; token: string }> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash the password using crypto
    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(createUserDto.password, salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString('hex')}.${salt}`;

    try {
      // Execute both operations in a transaction
      const result = await this.prisma.$transaction(async (prisma) => {
        // Create a new workspace first
        const workspace = await prisma.workspace.create({
          data: {
            name: createUserDto.workspaceName,
            credits: 50, // Default starting credits
          },
        });

        // Then create the user with a reference to the workspace
        const user = await prisma.user.create({
          data: {
            email: createUserDto.email,
            password: hashedPassword,
            name: createUserDto.name,
            workspaceId: workspace.id,
            provider: 'password', // Set initial provider to password
            emailVerified: false, // Explicitly set to false for email verification flow
          },
        });

        // Generate JWT token
        const token = this.jwtService.sign({
          userId: user.id,
          email: user.email,
          workspaceId: user.workspaceId,
        });

        // Return user data (excluding the password) and token
        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            workspaceId: user.workspaceId,
            provider: user.provider,
            firstName: user.firstName || undefined,
            lastName: user.lastName || undefined,
            avatar: user.avatar || undefined,
            emailVerified: user.emailVerified || false,
          },
          token,
        };
      });

      this.logger.log(`User created successfully: ${JSON.stringify(result)}`);

      // Send verification email synchronously before returning
      const requireVerification =
        this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !==
        'false';

      if (requireVerification) {
        try {
          // Send verification email synchronously
          const emailSent =
            await this.verificationService.sendVerificationEmail(
              result.user.id
            );

          if (emailSent) {
            this.logger.log(
              `Verification email sent to user ${result.user.id}`
            );
          } else {
            this.logger.error(
              `Failed to send verification email to user ${result.user.id}`
            );
          }
        } catch (error) {
          // Log the error but don't fail registration if email sending fails
          this.logger.error(
            `Error sending verification email: ${error.message}`
          );
        }
      } else {
        this.logger.log(
          `Email verification not required for user ${result.user.id}`
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  async login(
    loginUserDto: LoginUserDto
  ): Promise<{ user: UserResponseDto; token: string }> {
    // Find the user
    let user = await this.prisma.user.findUnique({
      where: { email: loginUserDto.email },
    });

    if (!user) {
      throw new BadRequestException('Invalid credentials');
    }

    // Check if user has a password (might not if they used OAuth)
    if (!user.password) {
      throw new BadRequestException(
        'This account uses social login. Please sign in with Google or Facebook.'
      );
    }

    // Verify password
    try {
      // Split the stored hash and salt
      const [storedHash, salt] = user.password.split('.');
      const storedHashBuf = Buffer.from(storedHash, 'hex');
      // Hash the input password with the same salt
      const suppliedHashBuf = (await scryptAsync(
        loginUserDto.password,
        salt,
        64
      )) as Buffer;

      // Compare the hashes using timingSafeEqual to prevent timing attacks
      const isPasswordValid = timingSafeEqual(storedHashBuf, suppliedHashBuf);

      if (!isPasswordValid) {
        throw new BadRequestException('Invalid credentials');
      }
    } catch (error) {
      // Handle any errors during password verification
      this.logger.error(`Error verifying password: ${error.message}`);
      throw new BadRequestException('Invalid credentials');
    }

    // Check if email verification is required
    const requireVerification =
      this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false';

    if (
      requireVerification &&
      !user.emailVerified &&
      user.provider === 'password'
    ) {
      // Don't block login, but include a flag indicating that verification is needed
      this.logger.log(`User ${user.id} logged in with unverified email`);

      // Try to resend verification email synchronously
      try {
        const emailSent = await this.verificationService.sendVerificationEmail(
          user.id
        );
        if (emailSent) {
          this.logger.log(`Verification email resent to user ${user.id}`);
        } else {
          this.logger.error(
            `Failed to resend verification email to user ${user.id}`
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to resend verification email: ${error.message}`
        );
      }
    }

    // Update provider field to indicate password login
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { provider: 'password' },
    });

    // Generate JWT token
    const token = this.jwtService.sign({
      userId: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
    });

    // Return user data (excluding the password) and token
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workspaceId: user.workspaceId,
        provider: user.provider,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        avatar: user.avatar || undefined,
        emailVerified: user.emailVerified || false,
      },
      token,
    };
  }

  async logout(userId: string, token: string): Promise<{ success: boolean }> {
    try {
      // Get token expiry information
      const decodedToken = this.jwtService.decode(token) as { exp: number };

      if (!decodedToken || !decodedToken.exp) {
        throw new BadRequestException('Invalid token format');
      }

      const expiryDate = new Date(decodedToken.exp * 1000); // Convert UNIX timestamp to Date

      this.logger.log(
        `Logging out user ${userId}, blacklisting token until ${expiryDate}`
      );

      // Blacklist the token using Prisma's type-safe API
      await this.prisma.blacklistedToken.create({
        data: {
          id: randomUUID(),
          token: token,
          userId: userId, // This matches the schema field
          expiresAt: expiryDate,
          createdAt: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error during logout: ${error.message}`);
      throw error;
    }
  }

  async findOne(id: string): Promise<UserResponseDto> {
    if (!id) {
      throw new BadRequestException('User ID is required');
    }

    try {
      const user: User = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        workspaceId: user.workspaceId,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        avatar: user.avatar || undefined,
        provider: user.provider || undefined,
        emailVerified: user.emailVerified || false,
      };
    } catch (error) {
      this.logger.error(`Error finding user with ID ${id}: ${error.message}`);
      throw error;
    }
  }
}
