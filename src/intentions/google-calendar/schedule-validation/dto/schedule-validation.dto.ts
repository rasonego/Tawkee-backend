import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  IsNotEmpty,
  IsDate
} from 'class-validator';
import { Type } from 'class-transformer';

export class TimeRangeDto {
  @IsString()
  start: string; // "08:00"

  @IsString()
  end: string; // "18:00"
}

export class WeekdayScheduleDto {
  @ValidateNested({ each: true })
  @Type(() => TimeRangeDto)
  periods: TimeRangeDto[];
}

export class AvailableTimesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  monday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  tuesday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  wednesday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  thursday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  friday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  saturday?: WeekdayScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => WeekdayScheduleDto)
  sunday?: WeekdayScheduleDto;
}

export class ScheduleSettingsDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  agentId: string;

  @IsDate()
  @IsNotEmpty()
  createdAt: Date; // Using Date type

  @IsDate()
  @IsOptional()
  updatedAt: Date; // Using Date type

  @IsBoolean()
  alwaysOpen: boolean;

  @IsOptional()
  @IsInt()
  @Min(60)
  minAdvanceMinutes?: number;

  @IsOptional()
  @IsInt()
  maxAdvanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  maxEventDuration?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AvailableTimesDto)
  availableTimes?: AvailableTimesDto;

  @IsOptional()
  @IsBoolean()
  askForContactName?: boolean;

  @IsOptional()
  @IsBoolean()
  askForContactPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  askForMeetingDuration?: boolean;
}

export class PartialScheduleSettingsDto {
  @IsOptional()
  @IsBoolean()
  alwaysOpen?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minAdvanceMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(7)
  maxAdvanceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  maxEventDuration?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AvailableTimesDto)
  availableTimes?: AvailableTimesDto;

  @IsOptional()
  @IsBoolean()
  askForContactName?: boolean;

  @IsOptional()
  @IsBoolean()
  askForContactPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  askForMeetingDuration?: boolean;
}