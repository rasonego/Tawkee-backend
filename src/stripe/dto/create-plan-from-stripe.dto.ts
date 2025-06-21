import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsNotEmpty,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanFromStripeDto {
  @IsString()
  @IsNotEmpty()
  planName: string;

  @IsArray()
  @IsOptional()
  features?: string[]; // assuming feature labels are strings

  @IsOptional()
  @IsInt()
  agentLimit?: number;

  @IsOptional()
  @IsInt()
  creditsLimit?: number;

  @IsOptional()
  @IsInt()
  trainingTextLimit?: number;

  @IsOptional()
  @IsInt()
  trainingWebsiteLimit?: number;

  @IsOptional()
  @IsInt()
  trainingVideoLimit?: number;

  @IsOptional()
  @IsInt()
  trainingDocumentLimit?: number;

  @IsOptional()
  @IsBoolean()
  isEnterprise?: boolean;

  @IsOptional()
  @IsInt()
  trialDays?: number;
}
