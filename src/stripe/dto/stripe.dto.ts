import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
} from 'class-validator';

export enum PlanInterval {
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export class CreateSubscriptionDto {
  @IsString()
  workspaceId: string;

  @IsString()
  planId: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(PlanInterval)
  interval: PlanInterval;

  @IsOptional()
  @IsNumber()
  intervalCount?: number;

  @IsOptional()
  features?: string[];

  @IsOptional()
  @IsNumber()
  apiRequestLimit?: number;

  @IsOptional()
  @IsNumber()
  agentLimit?: number;

  @IsOptional()
  @IsBoolean()
  isEnterprise?: boolean;

  @IsOptional()
  @IsNumber()
  trialDays?: number;
}

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}

export class WebhookEventDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  data: any;
}
