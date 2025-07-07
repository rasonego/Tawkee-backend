import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class UpdatePlanFromFormDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsNumber()
  creditsLimit?: number | null;

  @IsOptional()
  @IsNumber()
  agentsLimit?: number | null;

  @IsOptional()
  @IsNumber()
  trialDays?: number | null;

  @IsOptional()
  @IsNumber()
  trainingTextLimit?: number | null;

  @IsOptional()
  @IsNumber()
  trainingDocumentLimit?: number | null;

  @IsOptional()
  @IsNumber()
  trainingVideoLimit?: number | null;

  @IsOptional()
  @IsNumber()
  trainingWebsiteLimit?: number | null;

  @IsBoolean()
  isActive: boolean;

  @IsBoolean()
  isEnterprise: boolean;

  @IsArray()
  @IsString({ each: true })
  features: string[];
}
