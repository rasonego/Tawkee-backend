import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspaceDto, WorkspaceCreditsDto } from './dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces' })
  @ApiResponse({
    status: 200,
    description: 'Returns a list of workspaces (their ids and names)',
    type: [WorkspaceDto],
  })
  async findAll(): Promise<WorkspaceDto[]> {
    return this.workspacesService.findAll();
  }

  @Get(':workspaceId/credits')
  @ApiOperation({ summary: 'Get workspace credits' })
  @ApiResponse({
    status: 200,
    description:
      'Returns the amount of credits (integer) and subscription status',
    type: WorkspaceCreditsDto,
  })
  async getCredits(
    @Param('workspaceId') workspaceId: string
  ): Promise<WorkspaceCreditsDto> {
    return this.workspacesService.getCredits(workspaceId);
  }
}
