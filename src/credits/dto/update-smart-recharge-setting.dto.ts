import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateSmartRechargeSettingDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rechargeAmount?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
