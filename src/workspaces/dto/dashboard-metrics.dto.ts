import { ApiProperty } from '@nestjs/swagger';

class AgentConsumptionDto {
  @ApiProperty()
  agentId: string;

  @ApiProperty({ nullable: true })
  name: string | null;

  @ApiProperty({ nullable: true })
  jobName: string | null;

  @ApiProperty({ nullable: true })
  avatar: string | null;

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
  credits: number;
}

class CreditPerDayDto {
  @ApiProperty()
  date: string;

  @ApiProperty()
  totalCredits: number;

  @ApiProperty({ type: [CreditByAgentDto] })
  creditsByAgent: CreditByAgentDto[];
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

export class DashboardMetricsDto {
  @ApiProperty({ type: ResolvedMetricsDto })
  resolved: ResolvedMetricsDto;

  @ApiProperty({ type: RunningMetricsDto })
  running: RunningMetricsDto;

  @ApiProperty()
  avgInteractionTimeMs: number;

  @ApiProperty()
  avgTimeTrend: number;

  @ApiProperty({ type: [CreditPerDayDto] })
  creditsPerDay: CreditPerDayDto[];

  @ApiProperty({ type: [AgentConsumptionDto] })
  topAgents: AgentConsumptionDto[];

  @ApiProperty({ type: [ModelConsumptionDto] })
  topModels: ModelConsumptionDto[];
}
