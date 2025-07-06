import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtPayload } from 'src/auth/auth.guard';
import { PrismaService } from 'src/prisma/prisma.service';

export interface RequestWithUser extends Request {
  user: JwtPayload;
  token?: string;
}

@Injectable()
export class CanPermformOperationGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly prisma: PrismaService
) {}

  private async checkPermission(user: any, action: string, resource: string) {
    // Check userPermissions first (higher precedence)
    const userPermission = user.userPermissions.find(
        (permission: any) => permission.permission.resource === resource && permission.permission.action === action
    );
   
    if (userPermission) {
        return userPermission.allowed;
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
        where: { roleId: user.roleId },
        select: {
            permission: {
                select: {
                    action: true,
                    resource: true
                }
            }
        }
    });

    // Check rolePermissions if no userPermissions
    const rolePermission = rolePermissions.find(
        (permission) => permission.permission.resource === resource && permission.permission.action === action
    );
    if (rolePermission) {
        return true;
    }

    return false;    
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user.userId;
    const workspaceId = request.params?.workspaceId;

    const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
            roleId: true,
            workspaceId: true,
            userPermissions: {
                select: {
                    allowed: true,
                    permission: {
                        select: {
                            action: true,
                            resource: true,
                        },
                    },
                },
            },
        },
    });
    
    if (!user) {
        throw new NotFoundException(`User ${userId} not found.`);
    }

    let adminOperation = undefined;
    if (workspaceId) {
        adminOperation = workspaceId === user.workspaceId;         
    }

    const action = this.reflector.get<string>('action', context.getHandler());
    const resource = this.reflector.get<string>('resource', context.getHandler());

    console.log(adminOperation, workspaceId, user.workspaceId, action, resource);

    let allowed: boolean = false;
    if (adminOperation === true) {
        allowed = await this.checkPermission(user, action + '_AS_ADMIN', resource);

    } else if (adminOperation === false) {
        allowed = await this.checkPermission(user, action, resource);
    } else {
        const allowedAsAdmin = await this.checkPermission(user, action + '_AS_ADMIN', resource);
        const allowedAsClient = await this.checkPermission(user, action, resource);
        allowed = allowedAsAdmin || allowedAsClient;
    }

    if (!allowed) {
        throw new UnauthorizedException(`You do not have permission to execute this operation.`);
    }

    return true;
  }
}