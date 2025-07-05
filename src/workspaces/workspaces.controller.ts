import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { PaginatedWorkspaceResponseDto, WorkspaceDto } from './dto/workspace.dto';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto';
import { DashboardMetricsQueryDto } from './dto/dashboard-metrics-query.dto';
import { differenceInDays, parseISO, isValid, subDays } from 'date-fns';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination.decorator';
import { PaginationDto } from 'src/common/dto/pagination.dto';

@ApiTags('Workspaces')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  @ApiOperation({ summary: 'List all workspaces with pagination and optional search' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of workspaces with subscription and user email',
    type: PaginatedWorkspaceResponseDto,
  })
  @ApiPaginationQueries()
  async findAll(
    @Query() paginationDto: PaginationDto
  ): Promise<PaginatedWorkspaceResponseDto> {
    return this.workspacesService.findAll(paginationDto);
  }

  @Get('basic')
  @ApiOperation({ summary: 'List all workspaces (id, name, email, isActive) without pagination' })
  @ApiResponse({
    status: 200,
    description: 'Returns all workspace ids, names, and user emails without pagination',
    type: [Object], // Ideally replace with a DTO class if available
  })
  async findAllBasic(): Promise<{ id: string; name: string; email: string | null }[]> {
    return this.workspacesService.findAllWorkspacesBasicInfo();
  }

  @Get(':workspaceId/dashboard-metrics')
  async getDashboardMetrics(
    @Param('workspaceId') workspaceId: string,
    @Query() query: DashboardMetricsQueryDto
  ): Promise<DashboardMetricsDto> {
    const { startDate, endDate } = query;

    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (!isValid(start) || !isValid(end)) {
      throw new BadRequestException('Invalid startDate or endDate');
    }

    const rangeDays = differenceInDays(end, start);
    if (rangeDays > 180) {
      throw new BadRequestException('Date range cannot exceed 180 days');
    }

    // 🧠 Compute comparison range with same length, ending one day before `start`
    const comparisonEnd = subDays(start, 1);
    const comparisonStart = subDays(comparisonEnd, rangeDays);

    return this.workspacesService.getDashboardMetrics(
      workspaceId != 'all' ? workspaceId : null,
      startDate,
      endDate,
      comparisonStart.toISOString().slice(0, 10),
      comparisonEnd.toISOString().slice(0, 10)
    );
  }

  @Get(':workspaceId/detailed')
  @ApiOperation({ summary: 'Fetch detailed info for a single workspace' })
  @ApiResponse({
    status: 200,
    description:
      'Returns full data for a workspace: subscription, plan, agents, usage records, credit purchases, and users.',
    type: Object, // You can replace this with a proper DTO if needed
  })
  async getDetailedWorkspace(
    @Param('workspaceId') workspaceId: string
  ): Promise<any> {
    return this.workspacesService.getDetailedWorkspace(workspaceId);
  }


  @Put(':workspaceId/activate')
  @ApiOperation({ summary: 'Activate a workspace' })
  @ApiResponse({ status: 200, description: 'Workspace activated successfully' })
  async activateWorkspace(@Param('workspaceId') workspaceId: string): Promise<void> {
    await this.workspacesService.activateWorkspace(workspaceId);
  }

  @Put(':workspaceId/deactivate')
  @ApiOperation({ summary: 'Deactivate a workspace and all its agents' })
  @ApiResponse({ status: 200, description: 'Workspace deactivated successfully' })
  async deactivateWorkspace(@Param('workspaceId') workspaceId: string): Promise<void> {
    await this.workspacesService.deactivateWorkspace(workspaceId);
  }  
}
