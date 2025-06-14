import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AgentSettingsService } from './agent-settings.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { AgentSettingsDto } from './dto/agent-settings.dto';

@ApiTags('Agent Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class AgentSettingsController {
  constructor(private readonly agentSettingsService: AgentSettingsService) {}

  @Get('agent/:agentId/settings')
  @ApiOperation({ summary: 'Get agent settings' })
  @ApiResponse({
    status: 200,
    description: 'Return current settings of existing agent',
    type: AgentSettingsDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Database connection error or internal server error',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: false,
        },
        message: {
          type: 'string',
          example: 'Database connection error. Please try again later.',
        },
        error: {
          type: 'string',
          example: 'DATABASE_CONNECTION_ERROR',
        },
      },
    },
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async getSettings(
    @Param('agentId') agentId: string
  ): Promise<AgentSettingsDto> {
    return this.agentSettingsService.getSettings(agentId);
  }

  @Put('agent/:agentId/settings')
  @ApiOperation({ summary: 'Update agent settings' })
  @ApiResponse({
    status: 200,
    description: 'Return whether the action was successful or not',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: true,
        },
        message: {
          type: 'string',
          example: 'Agent settings updated successfully',
          description: 'Provides details about the operation result',
        },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Database connection error or internal server error',
    schema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          example: false,
        },
        message: {
          type: 'string',
          example: 'Database connection error. Please try again later.',
        },
        error: {
          type: 'string',
          example: 'DATABASE_CONNECTION_ERROR',
        },
      },
    },
  })
  @ApiParam({ name: 'agentId', description: 'Agent ID' })
  async updateSettings(
    @Param('agentId') agentId: string,
    @Body() agentSettingsDto: Partial<AgentSettingsDto>
  ): Promise<{ updatedSettingsDto: AgentSettingsDto }> {
    return this.agentSettingsService.updateSettings(agentId, agentSettingsDto);
  }
}
