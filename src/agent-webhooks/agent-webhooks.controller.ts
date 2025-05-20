import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AgentWebhooksService } from './agent-webhooks.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AgentWebhooksDto } from './dto/agent-webhooks.dto';

@ApiTags('Agent Webhooks')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class AgentWebhooksController {
  constructor(private readonly agentWebhooksService: AgentWebhooksService) {}

  @Get('agent/:agentId/webhooks')
  @ApiOperation({ summary: 'Get agent webhooks' })
  @ApiResponse({
    status: 200,
    description: 'Returns webhook URLs',
    type: AgentWebhooksDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async getWebhooks(
    @Param('agentId') agentId: string
  ): Promise<AgentWebhooksDto> {
    return this.agentWebhooksService.getWebhooks(agentId);
  }

  @Put('agent/:agentId/webhooks')
  @ApiOperation({ summary: 'Update agent webhooks' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the action succeeded or failed',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
      },
    },
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async updateWebhooks(
    @Param('agentId') agentId: string,
    @Body() agentWebhooksDto: AgentWebhooksDto
  ): Promise<{ success: boolean }> {
    return this.agentWebhooksService.updateWebhooks(agentId, agentWebhooksDto);
  }
}
