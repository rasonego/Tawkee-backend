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
import { StripeService } from 'src/stripe/stripe.service';
import { hasExplicitValue } from 'src/workspaces/workspaces.service';
import { UpdateUserPermissionsDto } from './dto/update-user-permission.dto';

const scryptAsync = promisify(scrypt);

export type LimitOverrideDto = {
  value: number | null;
  explicitlySet: boolean;
};

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
    private readonly stripeService: StripeService
  ) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    this.redirectUri = this.configService.get<string>('GOOGLE_CALLBACK_URL');
    this.stateSecret = this.configService.get<string>('GOOGLE_STATE_SECRET');
  }

  async create(
    createUserDto: CreateUserDto,
    roleName: string = 'CLIENT', // Optional role parameter, defaults to CLIENT
    userPermissionsEntries: {
      action: string;
      resource: string;
      allowed: boolean;
    }[] = [] // Optional permissions array, defaults to empty
  ): Promise<{ user: UserResponseDto; token: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser)
      throw new ConflictException('User with this email already exists');

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
            trialDays: true,
          },
        });

        if (!plan) throw new Error('No valid public trial plan found');

        const now = new Date();
        const trialEnd = new Date(
          now.getTime() + (plan.trialDays ?? 14) * 86400000
        );

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
            agentLimitOverrides: true,
            creditsLimitOverrides: true,
            trainingTextLimitOverrides: true,
            trainingWebsiteLimitOverrides: true,
            trainingVideoLimitOverrides: true,
            trainingDocumentLimitOverrides: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
          },
        });

        await prisma.smartRechargeSetting.create({
          data: {
            workspaceId: workspace.id,
            threshold: 1000,
            rechargeAmount: 1000,
            active: false,
          },
        });

        const role = await prisma.role.findUnique({
          where: { name: roleName },
        });

        const user = await prisma.user.create({
          data: {
            email: createUserDto.email,
            password: hashedPassword,
            name: createUserDto.name,
            workspaceId: workspace.id,
            provider: 'password',
            emailVerified: false,
            roleId: role.id,
          },
        });

        const token = this.jwtService.sign({
          userId: user.id,
          email: user.email,
          workspaceId: user.workspaceId,
        });

        // Create UserPermission entries if provided
        if (userPermissionsEntries.length > 0) {
          const userPermissionsData = await Promise.all(
            userPermissionsEntries.map(async (permission) => {
              const permissionId = await this.getPermissionId(
                permission.resource,
                permission.action
              ); // Get permission ID asynchronously
              return {
                userId: user.id,
                permissionId: permissionId, // Use the permission ID
                allowed: permission.allowed,
              };
            })
          );

          // Create UserPermission entries
          await prisma.userPermission.createMany({
            data: userPermissionsData,
          });
        }

        const rolePermissions = await this.prisma.rolePermission.findMany({
          where: { roleId: role.id },
          include: {
            permission: {
              select: {
                resource: true,
                action: true,
              },
            },
          },
        });

        const userPermissions = await this.prisma.userPermission.findMany({
          where: { userId: user.id },
          include: {
            permission: {
              select: {
                resource: true,
                action: true,
              },
            },
          },
        });

        const stripePrice = await this.stripeService.getPriceDetailsById(
          plan.stripePriceId
        );

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, stripePriceId, ...sanitizedPlan } = plan;

        return {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            workspaceId: user.workspaceId,
            workspaceIsActive: workspace.isActive,
            provider: user.provider,
            firstName: user.firstName || undefined,
            lastName: user.lastName || undefined,
            avatar: user.avatar || undefined,
            emailVerified: user.emailVerified || false,
            role: {
              name: role.name,
              description: role.description,
            },
            rolePermissions: rolePermissions.map((permission) => {
              return {
                resource: permission.permission.resource,
                action: permission.permission.action,
              };
            }),
            userPermissions: userPermissions.map((permission) => {
              return {
                allowed: permission.allowed,
                resource: permission.permission.resource,
                action: permission.permission.action,
              };
            }),
            smartRecharge: {
              threshold: 1000,
              rechargeAmount: 1000,
              active: false,
            },
            subscription: {
              featureOverrides: subscription.featureOverrides as string[],
              currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
              trialEnd: subscription.trialEnd?.toISOString(),

              ...(hasExplicitValue(subscription.agentLimitOverrides)
                ? {
                    agentLimitOverrides: subscription.agentLimitOverrides
                      .value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.creditsLimitOverrides)
                ? {
                    creditsLimitOverrides: subscription.creditsLimitOverrides
                      .value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingTextLimitOverrides)
                ? {
                    trainingTextLimitOverrides: subscription
                      .trainingTextLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingWebsiteLimitOverrides)
                ? {
                    trainingWebsiteLimitOverrides: subscription
                      .trainingWebsiteLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingDocumentLimitOverrides)
                ? {
                    trainingDocumentLimitOverrides: subscription
                      .trainingDocumentLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingVideoLimitOverrides)
                ? {
                    trainingVideoLimitOverrides: subscription
                      .trainingVideoLimitOverrides.value as number,
                  }
                : {}),
            },
            plan: {
              ...sanitizedPlan,
              ...stripePrice,
              features: sanitizedPlan.features as string[],
            },
          },
          token,
        };
      });

      if (
        this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false'
      ) {
        await this.verificationService.sendVerificationEmail(result.user.id);
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
    let user = await this.prisma.user.findUnique({
      where: { email: loginUserDto.email },
      include: {
        workspace: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (!user || !user.password) {
      throw new BadRequestException(
        'Invalid credentials or social login account'
      );
    }

    try {
      const [storedHash, salt] = user.password.split('.');
      const storedHashBuf = Buffer.from(storedHash, 'hex');
      const suppliedHashBuf = (await scryptAsync(
        loginUserDto.password,
        salt,
        64
      )) as Buffer;

      if (!timingSafeEqual(storedHashBuf, suppliedHashBuf)) {
        throw new BadRequestException('Invalid credentials');
      }
    } catch (error) {
      this.logger.error(`Error verifying password: ${error.message}`);
      throw new BadRequestException('Invalid credentials');
    }

    if (
      this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION') !==
        'false' &&
      !user.emailVerified
    ) {
      await this.verificationService.sendVerificationEmail(user.id);
    }

    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { provider: 'password' },
      include: {
        workspace: true,
      },
    });

    const smartRecharge = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId: user.workspaceId },
    });

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: user.workspaceId,
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
            trialDays: true,
          },
        },
      },
    });

    const stripePrice = subscription?.plan?.stripePriceId
      ? await this.stripeService.getPriceDetailsById(
          subscription.plan.stripePriceId
        )
      : undefined;

    const token = this.jwtService.sign({
      userId: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stripePriceId, ...sanitizedPlan } = subscription.plan;

    const roleOfUser = await this.prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        role: true,
      },
    });

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: roleOfUser.role.id },
      select: {
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
      },
    });

    const userPermissions = await this.prisma.userPermission.findMany({
      where: {
        userId: user.id,
      },
      select: {
        allowed: true,
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workspaceId: user.workspaceId,
        workspaceIsActive: user.workspace.isActive,
        provider: user.provider,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        avatar: user.avatar || undefined,
        emailVerified: user.emailVerified || false,
        role: roleOfUser.role,
        rolePermissions: rolePermissions.map((permission) => {
          return {
            resource: permission.permission.resource,
            action: permission.permission.action,
          };
        }),
        userPermissions: userPermissions.map((permission) => {
          return {
            allowed: permission.allowed,
            resource: permission.permission.resource,
            action: permission.permission.action,
          };
        }),
        smartRecharge: smartRecharge || undefined,
        subscription: subscription
          ? {
              currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
              trialEnd: subscription.trialEnd?.toISOString(),
              featureOverrides: subscription.featureOverrides as string[],

              ...(hasExplicitValue(subscription.agentLimitOverrides)
                ? {
                    agentLimitOverrides: subscription.agentLimitOverrides
                      .value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.creditsLimitOverrides)
                ? {
                    creditsLimitOverrides: subscription.creditsLimitOverrides
                      .value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingTextLimitOverrides)
                ? {
                    trainingTextLimitOverrides: subscription
                      .trainingTextLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingWebsiteLimitOverrides)
                ? {
                    trainingWebsiteLimitOverrides: subscription
                      .trainingWebsiteLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingDocumentLimitOverrides)
                ? {
                    trainingDocumentLimitOverrides: subscription
                      .trainingDocumentLimitOverrides.value as number,
                  }
                : {}),
              ...(hasExplicitValue(subscription.trainingVideoLimitOverrides)
                ? {
                    trainingVideoLimitOverrides: subscription
                      .trainingVideoLimitOverrides.value as number,
                  }
                : {}),
            }
          : undefined,
        plan:
          sanitizedPlan && stripePrice
            ? {
                ...sanitizedPlan,
                ...stripePrice,
                features: sanitizedPlan.features as string[],
              }
            : undefined,
      },
      token,
    };
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        workspace: {
          select: {
            isActive: true,
          },
        },
      },
    });

    if (!user) throw new BadRequestException('User not found');

    const smartRecharge = await this.prisma.smartRechargeSetting.findUnique({
      where: { workspaceId: user.workspaceId },
    });

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        workspaceId: user.workspaceId,
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
            trialDays: true,
          },
        },
      },
    });

    const stripePrice = subscription?.plan?.stripePriceId
      ? await this.stripeService.getPriceDetailsById(
          subscription.plan.stripePriceId
        )
      : undefined;

    const roleOfUser = await this.prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        role: true,
      },
    });

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: roleOfUser.role.id },
      select: {
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
      },
    });

    const userPermissions = await this.prisma.userPermission.findMany({
      where: {
        userId: user.id,
      },
      select: {
        allowed: true,
        permission: {
          select: {
            resource: true,
            action: true,
          },
        },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { stripePriceId, ...sanitizedPlan } = subscription.plan;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      workspaceId: user.workspaceId,
      workspaceIsActive: user.workspace.isActive,
      provider: user.provider || undefined,
      firstName: user.firstName || undefined,
      lastName: user.lastName || undefined,
      avatar: user.avatar || undefined,
      emailVerified: user.emailVerified || false,
      role: roleOfUser.role,
      rolePermissions: rolePermissions.map((permission) => {
        return {
          resource: permission.permission.resource,
          action: permission.permission.action,
        };
      }),
      userPermissions: userPermissions.map((permission) => {
        return {
          allowed: permission.allowed,
          resource: permission.permission.resource,
          action: permission.permission.action,
        };
      }),
      smartRecharge: smartRecharge || undefined,
      subscription: subscription
        ? {
            currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
            trialEnd: subscription.trialEnd?.toISOString(),
            featureOverrides: subscription.featureOverrides as string[],

            ...(hasExplicitValue(subscription.agentLimitOverrides)
              ? {
                  agentLimitOverrides: subscription.agentLimitOverrides
                    .value as number,
                }
              : {}),
            ...(hasExplicitValue(subscription.creditsLimitOverrides)
              ? {
                  creditsLimitOverrides: subscription.creditsLimitOverrides
                    .value as number,
                }
              : {}),
            ...(hasExplicitValue(subscription.trainingTextLimitOverrides)
              ? {
                  trainingTextLimitOverrides: subscription
                    .trainingTextLimitOverrides.value as number,
                }
              : {}),
            ...(hasExplicitValue(subscription.trainingWebsiteLimitOverrides)
              ? {
                  trainingWebsiteLimitOverrides: subscription
                    .trainingWebsiteLimitOverrides.value as number,
                }
              : {}),
            ...(hasExplicitValue(subscription.trainingDocumentLimitOverrides)
              ? {
                  trainingDocumentLimitOverrides: subscription
                    .trainingDocumentLimitOverrides.value as number,
                }
              : {}),
            ...(hasExplicitValue(subscription.trainingVideoLimitOverrides)
              ? {
                  trainingVideoLimitOverrides: subscription
                    .trainingVideoLimitOverrides.value as number,
                }
              : {}),
          }
        : undefined,
      plan:
        sanitizedPlan && stripePrice
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

  // Method to update user permissions
  async updatePermissions(
    userId: string,
    updateUserPermissionsDto: UpdateUserPermissionsDto
  ): Promise<{ success: boolean }> {
    try {
      // Step 1: Retrieve user and their associated role
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: { include: { permissions: true } }, // Include permissions related to role
          userPermissions: { include: { permission: true } }, // Include current user permissions
        },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Step 2: Ensure we have the role permissions available
      const rolePermissions = user.role?.permissions || [];
      const userPermissions = user.userPermissions;

      // Step 3: Create user permissions based on the role permissions if not exist (done only once)
      for (const rolePermission of rolePermissions) {
        const exists = userPermissions.some(
          (userPermission) =>
            userPermission.permissionId === rolePermission.permissionId
        );

        // If permission does not exist for user, create it with allowed = true
        if (!exists) {
          await this.prisma.userPermission.create({
            data: {
              userId,
              permissionId: rolePermission.permissionId,
              allowed: true, // Default permission is allowed = true
            },
          });
        }
      }

      // Step 4: Now, update the permissions as per the input provided
      for (const perm of updateUserPermissionsDto.permissions) {
        const permission = await this.prisma.permission.findUnique({
          where: {
            action_resource: { action: perm.action, resource: perm.resource },
          },
        });

        if (!permission) {
          throw new BadRequestException(
            `Permission with action ${perm.action} and resource ${perm.resource} does not exist`
          );
        }

        // Update the user permission entry for this specific permission
        await this.prisma.userPermission.updateMany({
          where: {
            userId,
            permissionId: permission.id,
          },
          data: {
            allowed: perm.allowed, // Set the new allowed state as per input
          },
        });
      }

      return { success: true };
    } catch (error) {
      console.error(error);
      throw new BadRequestException(
        'An error occurred while updating permissions'
      );
    }
  }

  private async getPermissionId(
    resource: string,
    action: string
  ): Promise<string | null> {
    try {
      const permission = await this.prisma.permission.findUnique({
        where: {
          action_resource: {
            action: action,
            resource: resource,
          },
        },
      });

      return permission?.id || null;
    } catch (error) {
      this.logger.error(`Error fetching permission ID: ${error.message}`);
      throw new Error('Permission not found');
    }
  }
}
