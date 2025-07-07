import { ApiProperty } from '@nestjs/swagger';

export class AgentConsumptionDto {
  @ApiProperty()
  agentId: string;

  @ApiProperty({ nullable: true })
  name: string | null;

  @ApiProperty({ nullable: true })
  jobName?: string | null;

  @ApiProperty({ nullable: true })
  avatar?: string | null;

  @ApiProperty()
  totalCredits?: number;
}

export class WorkspaceConsumptionDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty({ nullable: true })
  name: string | null;

  @ApiProperty()
  totalCredits: number;
}

class ModelConsumptionDto {
  @ApiProperty()
  model: string;

  @ApiProperty()
  credits: number;
}

class CreditByAgentDto {
  @ApiProperty()
  agentId: string;

  @ApiProperty()
  agentName?: string;

  @ApiProperty()
  credits: number;
}

class CreditByWorkspaceDto {
  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  workspaceName?: string;

  @ApiProperty()
  credits: number;
}

class CreditPerDayAgentDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  totalCredits: number;

  @ApiProperty({ type: [CreditByAgentDto] })
  creditsByAgent: CreditByAgentDto[];
}

class CreditPerDayWorkspaceDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  totalCredits: number;

  @ApiProperty({ type: [CreditByWorkspaceDto] })
  creditsByWorkspace: CreditByWorkspaceDto[];
}

class TimeSeriesItemDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  total: number;

  @ApiProperty()
  byAI: number;

  @ApiProperty()
  byHuman: number;
}

class ResolvedTrendDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  byAI: number;

  @ApiProperty()
  byHuman: number;
}

class ResolvedMetricsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  byAI: number;

  @ApiProperty()
  byHuman: number;

  @ApiProperty({ type: [TimeSeriesItemDto] })
  timeSeries: TimeSeriesItemDto[];

  @ApiProperty({ type: ResolvedTrendDto })
  trend: ResolvedTrendDto;
}

class RunningInteractionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  userName: string | null;

  @ApiProperty({ nullable: true })
  whatsappPhone: string | null;

  @ApiProperty()
  isWaiting: boolean;
}

class RunningMetricsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  waiting: number;

  @ApiProperty({ type: [RunningInteractionDto] })
  interactions: RunningInteractionDto[];
}

// DTO for workspace-specific dashboard (when workspaceId is provided)
export class WorkspaceDashboardMetricsDto {
  @ApiProperty({ type: ResolvedMetricsDto })
  resolved: ResolvedMetricsDto;

  @ApiProperty({ type: RunningMetricsDto })
  running: RunningMetricsDto;

  @ApiProperty()
  avgInteractionTimeMs: number;

  @ApiProperty()
  avgTimeTrend: number;

  @ApiProperty({ type: [CreditPerDayAgentDto] })
  creditsPerDay: CreditPerDayAgentDto[];

  @ApiProperty({ type: [AgentConsumptionDto] })
  topAgents: AgentConsumptionDto[];

  @ApiProperty({ type: [ModelConsumptionDto] })
  topModels: ModelConsumptionDto[];
}

// DTO for global dashboard (when workspaceId is null)
export class GlobalDashboardMetricsDto {
  @ApiProperty({ type: ResolvedMetricsDto })
  resolved: ResolvedMetricsDto;

  @ApiProperty({ type: RunningMetricsDto })
  running: RunningMetricsDto;

  @ApiProperty()
  avgInteractionTimeMs: number;

  @ApiProperty()
  avgTimeTrend: number;

  @ApiProperty({ type: [CreditPerDayWorkspaceDto] })
  creditsPerDay: CreditPerDayWorkspaceDto[];

  @ApiProperty({ type: [WorkspaceConsumptionDto] })
  topWorkspaces: WorkspaceConsumptionDto[];

  @ApiProperty({ type: [ModelConsumptionDto] })
  topModels: ModelConsumptionDto[];
}

// Union type for the method return
export type DashboardMetricsDto =
  | WorkspaceDashboardMetricsDto
  | GlobalDashboardMetricsDto;
