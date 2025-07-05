import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class WorkspaceIsActiveGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const agentId = request.params.agentId;

    if (!agentId) return true;

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: { workspaceId: true },
    });

    if (!agent) {
      throw new NotFoundException(`Agent ${agentId} not found.`);
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: agent.workspaceId },
      select: {
        name: true,
        isActive: true,
        isDeleted: true
      }
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace ${agent.workspaceId} not found.`);
    }

    if (workspace.isDeleted) {
      throw new UnauthorizedException(`Workspace ${workspace.name} has been deleted.`);
    }

    if (!workspace.isActive) {
      throw new UnauthorizedException(`Workspace ${workspace.name} is not active.`);
    }
 
    return true;
  }
}
