import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { AgentWebhooksDto } from './dto/agent-webhooks.dto';

@Injectable()
export class AgentWebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService
  ) {}

  async getWebhooks(agentId: string): Promise<AgentWebhooksDto> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    const webhooks = await this.prisma.agentWebhooks.findUnique({
      where: { agentId },
    });

    if (!webhooks) {
      // Return empty webhooks if they don't exist
      return {
        onNewMessage: null,
        onLackKnowLedge: null,
        onTransfer: null,
        onFinishAttendance: null,
      };
    }

    return {
      onNewMessage: webhooks.onNewMessage,
      onLackKnowLedge: webhooks.onLackKnowLedge,
      onTransfer: webhooks.onTransfer,
      onFinishAttendance: webhooks.onFinishAttendance,
    };
  }

  async updateWebhooks(
    agentId: string,
    agentWebhooksDto: AgentWebhooksDto
  ): Promise<{ success: boolean }> {
    // Ensure agent exists
    await this.agentsService.findOne(agentId);

    // Check if webhooks exist
    const existingWebhooks = await this.prisma.agentWebhooks.findUnique({
      where: { agentId },
    });

    if (existingWebhooks) {
      // Update existing webhooks
      await this.prisma.agentWebhooks.update({
        where: { agentId },
        data: agentWebhooksDto,
      });
    } else {
      // Create new webhooks
      await this.prisma.agentWebhooks.create({
        data: {
          ...agentWebhooksDto,
          agentId,
        },
      });
    }

    return { success: true };
  }
}
