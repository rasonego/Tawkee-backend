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
import { scrypt, randomBytes, timingSafeEqual, randomUUID } from 'crypto';
import { promisify } from 'util';
import { JwtService } from '@nestjs/jwt';
import { VerificationService } from '../email/verification.service';
import { ConfigService } from '@nestjs/config';
import { CreditService } from 'src/credits/credit.service';
import { StripeService } from 'src/stripe/stripe.service';

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
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly creditService: CreditService
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    this.stateSecret = this.configService.get<string>('GOOGLE_STATE_SECRET');
  }

  async create(createUserDto: CreateUserDto): Promise<{ user: UserResponseDto; token: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) throw new ConflictException('User with this email already exists');

    const salt = randomBytes(16).toString('hex');
    const buf = (await scryptAsync(createUserDto.password, salt, 64)) as Buffer;
    const hashedPassword = `${buf.toString('hex')}.${salt}`;

    try {
      const result = await this.prisma.$transaction(async (prisma) => {
        const workspace = await prisma.workspace.create({
          data: { name: createUserDto.workspaceName },
        });

        const plan = await prisma.plan.findFirst({
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
            trialDays: true
          }
        });

        if (!plan) throw new Error('No valid public trial plan found');

        const now = new Date();
        const trialEnd = new Date(now.getTime() + (plan.trialDays ?? 14) * 86400000);

        const subscription = await prisma.subscription.create({
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
          select: {
            status: true,
            currentPeriodEnd: true,
            trialEnd: true,
            featureOverrides: true,
            creditsLimitOverrides: true,
            agentLimitOverrides: true,
            trainingTextLimitOverrides: true,
            trainingWebsiteLimitOverrides: true,
            trainingVideoLimitOverrides: true,
            trainingDocumentLimitOverrides: true,
            cancelAtPeriodEnd: true,
            canceledAt: true
          }
        });

        await prisma.smartRechargeSetting.create({
          data: {
            workspaceId: workspace.id,
            threshold: 1000,
            rechargeAmount: 1000,
            active: false,
          },
        });

        const user = await prisma.user.create({
          data: {
            email: createUserDto.email,
            password: hashedPassword,
            name: createUserDto.name,
            workspaceId: workspace.id,
            provider: 'password',
            emailVerified: false,
          },
        });

        const token = this.jwtService.sign({
          userId: user.id,
          email: user.email,
          workspaceId: user.workspaceId,
        });

        const stripePrice = await this.stripeService.getPriceDetailsById(plan.stripePriceId);

        const { id, stripePriceId, ...sanitizedPlan } = plan;

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
            smartRecharge: {
              threshold: 1000,
              rechargeAmount: 1000,
              active: false,
            },
            subscription: {
              ...subscription,
              featureOverrides: subscription.featureOverrides as string[],
              currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
              trialEnd: subscription.trialEnd?.toISOString(),
            },
            plan: {
              ...sanitizedPlan,
              ...stripePrice,
              features: sanitizedPlan.features as string[]
            },
          },
          token,
        };
      });

      if (this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false') {
        await this.verificationService.sendVerificationEmail(result.user.id);
      }

      return result;
    } catch (error) {
      this.logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  async login(loginUserDto: LoginUserDto): Promise<{ user: UserResponseDto; token: string }> {
    let user = await this.prisma.user.findUnique({
      where: { email: loginUserDto.email },
      include: { workspace: true },
    });

    if (!user || !user.password) {
      throw new BadRequestException('Invalid credentials or social login account');
    }

    try {
      const [storedHash, salt] = user.password.split('.');
      const storedHashBuf = Buffer.from(storedHash, 'hex');
      const suppliedHashBuf = (await scryptAsync(loginUserDto.password, salt, 64)) as Buffer;

      if (!timingSafeEqual(storedHashBuf, suppliedHashBuf)) {
        throw new BadRequestException('Invalid credentials');
      }
    } catch (error) {
      this.logger.error(`Error verifying password: ${error.message}`);
      throw new BadRequestException('Invalid credentials');
    }

    if (this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false' && !user.emailVerified) {
      await this.verificationService.sendVerificationEmail(user.id);
    }

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { provider: 'password' },
      include: { workspace: true },
    });

    const smartRecharge = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId: user.workspaceId },
    });

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: user.workspaceId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        currentPeriodEnd: true,
        trialEnd: true,
        featureOverrides: true,
        creditsLimitOverrides: true,
        agentLimitOverrides: true,
        trainingTextLimitOverrides: true,
        trainingWebsiteLimitOverrides: true,
        trainingVideoLimitOverrides: true,
        trainingDocumentLimitOverrides: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        plan: {
          select: {
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
            trialDays: true
          } 
        }
      },
    });

    const stripePrice = subscription?.plan?.stripePriceId
      ? await this.stripeService.getPriceDetailsById(subscription.plan.stripePriceId)
      : undefined;

    const token = this.jwtService.sign({
      userId: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
    });

    const { stripePriceId, ...sanitizedPlan } = subscription.plan; 

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
        smartRecharge: smartRecharge || undefined,
        subscription: subscription
          ? {
              ...subscription,
              currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
              trialEnd: subscription.trialEnd?.toISOString(),
              featureOverrides: subscription.featureOverrides as string[],
            }
          : undefined,
        plan: sanitizedPlan && stripePrice
          ? {
              ...sanitizedPlan,
              ...stripePrice,
              features: sanitizedPlan.features as string[]
            }
          : undefined,
      },
      token,
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { workspace: true },
    });

    if (!user) throw new BadRequestException('User not found');

    const smartRecharge = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId: user.workspaceId },
    });

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: user.workspaceId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        currentPeriodEnd: true,
        trialEnd: true,
        featureOverrides: true,
        creditsLimitOverrides: true,
        agentLimitOverrides: true,
        trainingTextLimitOverrides: true,
        trainingWebsiteLimitOverrides: true,
        trainingVideoLimitOverrides: true,
        trainingDocumentLimitOverrides: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        plan: {
          select: {
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
            trialDays: true
          }
        }
      },
    });

    const stripePrice = subscription?.plan?.stripePriceId
      ? await this.stripeService.getPriceDetailsById(subscription.plan.stripePriceId)
      : undefined;

    const { stripePriceId, ...sanitizedPlan } = subscription.plan; 

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaceId: user.workspaceId,
      provider: user.provider || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      avatar: user.avatar || undefined,
      emailVerified: user.emailVerified || false,
      smartRecharge: smartRecharge || undefined,
      subscription: subscription
        ? {
            ...subscription,
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            trialEnd: subscription.trialEnd?.toISOString(),
            featureOverrides: subscription.featureOverrides as string[],
          }
        : undefined,
      plan: sanitizedPlan && stripePrice
        ? {
            ...sanitizedPlan,
            ...stripePrice,
            name: sanitizedPlan.name,
            features: sanitizedPlan.features as string[],
          }
        : undefined,
    };
  }

  async logout(userId: string, token: string): Promise<{ success: boolean }> {
    try {
      const decodedToken = this.jwtService.decode(token) as { exp: number };

      if (!decodedToken || !decodedToken.exp) {
        throw new BadRequestException('Invalid token format');
      }

      const expiryDate = new Date(decodedToken.exp * 1000);

      this.logger.log(
        `Logging out user ${userId}, blacklisting token until ${expiryDate}`
      );

      await this.prisma.blacklistedToken.create({
        data: {
          id: randomUUID(),
          token: token,
          userId: userId,
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
}
