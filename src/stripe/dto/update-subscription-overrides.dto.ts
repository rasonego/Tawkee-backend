import {
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  ValidateNested,
  IsIn,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LimitOverrideDto {
  @ValidateIf((obj) => obj.value === 'UNLIMITED')
  @IsIn(['UNLIMITED'])
  @ValidateIf((obj) => typeof obj.value === 'number')
  @IsNumber()
  value?: number | 'UNLIMITED';

  @IsBoolean()
  explicitlySet: boolean;
}

export class SubscriptionOverrideDataDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featureOverrides?: string[];

  @IsOptional()
  @IsString()
  customStripePriceId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  creditsLimitOverrides?: LimitOverrideDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  agentLimitOverrides?: LimitOverrideDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  trainingTextLimitOverrides?: LimitOverrideDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  trainingWebsiteLimitOverrides?: LimitOverrideDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  trainingVideoLimitOverrides?: LimitOverrideDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimitOverrideDto)
  trainingDocumentLimitOverrides?: LimitOverrideDto | null;
}

export class UpdateSubscriptionOverridesDto {
  @IsString()
  subscriptionId: string;

  @ValidateNested()
  @Type(() => SubscriptionOverrideDataDto)
  overrides: SubscriptionOverrideDataDto;
}
