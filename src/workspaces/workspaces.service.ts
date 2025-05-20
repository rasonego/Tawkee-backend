import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceDto, WorkspaceCreditsDto } from './dto/workspace.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<WorkspaceDto[]> {
    const workspaces = await this.prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    return workspaces;
  }

  async getCredits(workspaceId: string): Promise<WorkspaceCreditsDto> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        credits: true,
        subscriptionStatus: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace with ID ${workspaceId} not found`);
    }

    return {
      credits: workspace.credits,
      status: workspace.subscriptionStatus,
    };
  }

  async findOne(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
    });

    if (!workspace) {
      throw new NotFoundException(`Workspace with ID ${id} not found`);
    }

    return workspace;
  }
}
