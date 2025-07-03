import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ApiPaginationQueries } from '../common/decorators/api-pagination.decorator';
import { PaginatedAgentsResponseDto } from './dto/paginated-agents-response.dto';
import { EnhancedAgentDto } from './dto/enhanced-agent.dto';

@ApiTags('Agents')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('workspace/:workspaceId/agents')
  @ApiOperation({ summary: 'List agents in a workspace' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the paginated list of agents with their settings and webhooks',
    type: PaginatedAgentsResponseDto,
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiPaginationQueries()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<any> {
    return this.agentsService.findAll(workspaceId, paginationDto);
  }

  @Get('workspace/:workspaceId/agents-as-admin')
  @ApiOperation({ summary: 'List agents in a workspace as admin' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the paginated list of agents with their settings and webhooks',
    type: PaginatedAgentsResponseDto,
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  @ApiPaginationQueries()
  async findAllAsAdmin(
    @Param('workspaceId') workspaceId: string,
    @Query() paginationDto: PaginationDto
  ): Promise<any> {
    return this.agentsService.findAll(workspaceId, paginationDto, true);
  }

  @Post('workspace/:workspaceId/agents')
  @ApiOperation({ summary: 'Create a new agent' })
  @ApiResponse({
    status: 200,
    description: 'Returns the created agent with settings and webhooks',
    type: EnhancedAgentDto,
  })
  @ApiParam({ name: 'workspaceId', description: 'Workspace ID' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() createAgentDto: CreateAgentDto
  ): Promise<EnhancedAgentDto> {
    return this.agentsService.create(workspaceId, createAgentDto);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get agent by ID' })
  @ApiResponse({
    status: 200,
    description: 'Returns agent data with settings and webhooks',
    type: EnhancedAgentDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async findOne(@Param('agentId') agentId: string): Promise<EnhancedAgentDto> {
    return this.agentsService.findOne(agentId);
  }

  @Put('agent/:agentId')
  @ApiOperation({ summary: 'Update an agent' })
  @ApiResponse({
    status: 200,
    description:
      'Returns all current data of the updated agent including settings and webhooks',
    type: EnhancedAgentDto,
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async update(
    @Param('agentId') agentId: string,
    @Body() updateAgentDto: UpdateAgentDto
  ): Promise<EnhancedAgentDto> {
    return this.agentsService.update(agentId, updateAgentDto);
  }

  @Delete('agent/:agentId')
  @ApiOperation({ summary: 'Delete an agent' })
  @ApiResponse({
    status: 200,
    description:
      'Returns whether the operation was successful or not, with detailed message',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        message: {
          type: 'string',
          example: 'Agent deleted successfully',
          description:
            'Provides details about the operation result, including error details if any',
        },
      },
    },
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async remove(
    @Param('agentId') agentId: string
  ): Promise<{ success: boolean; message?: string }> {
    const result = await this.agentsService.remove(agentId);

    if (!result.success) {
      // Return 400 Bad Request with the detailed error message
      throw new BadRequestException(result.message);
    }

    return result;
  }

  @Delete('agent-as-admin/:agentId')
  @ApiOperation({ summary: 'Delete an agent as admin' })
  @ApiResponse({
    status: 200,
    description:
      'Returns whether the operation was successful or not, with detailed message',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        message: {
          type: 'string',
          example: 'Agent deleted successfully',
          description:
            'Provides details about the operation result, including error details if any',
        },
      },
    },
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async removeAsAdmin(
    @Param('agentId') agentId: string
  ): Promise<{ success: boolean; message?: string }> {
    const result = await this.agentsService.remove(agentId, true);

    if (!result.success) {
      // Return 400 Bad Request with the detailed error message
      throw new BadRequestException(result.message);
    }

    return result;
  }

  @Put('agent/restore/:agentId')
  @ApiOperation({ summary: 'Restore a deleted agent' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the action was successful or not',
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
  async restore(
    @Param('agentId') agentId: string
  ): Promise<{ success: boolean }> {
    return this.agentsService.restore(agentId);
  }  

  @Put('agent/:agentId/inactive')
  @ApiOperation({ summary: 'Deactivate an agent' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the action was successful or not',
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
  async deactivate(
    @Param('agentId') agentId: string
  ): Promise<{ success: boolean }> {
    return this.agentsService.deactivate(agentId);
  }

  @Put('agent/:agentId/active')
  @ApiOperation({ summary: 'Activate an agent' })
  @ApiResponse({
    status: 200,
    description: 'Returns whether the action was successful or not',
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
  async activate(
    @Param('agentId') agentId: string
  ): Promise<{ success: boolean }> {
    return this.agentsService.activate(agentId);
  }
}
