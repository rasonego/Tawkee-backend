import {
  BadRequestException,
  Controller,
  Get,
  Param,
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
import { WorkspaceDto } from './dto/workspace.dto';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto';
import { DashboardMetricsQueryDto } from './dto/dashboard-metrics-query.dto';
import { differenceInDays, parseISO, isValid, subDays } from 'date-fns';

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
  @ApiOperation({ summary: 'Get current workspace credits' })
  @ApiResponse({
    status: 200,
    description: 'Returns current credit balance of the workspace',
    schema: {
      example: {
        credits: 250,
      },
    },
  })
  async getWorkspaceCredits(
    @Param('workspaceId') workspaceId: string
  ): Promise<{ credits: number }> {
    return this.workspacesService.getWorkspaceCredits(workspaceId);
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
      workspaceId,
      startDate,
      endDate,
      comparisonStart.toISOString().slice(0, 10),
      comparisonEnd.toISOString().slice(0, 10)
    );
  }
}
