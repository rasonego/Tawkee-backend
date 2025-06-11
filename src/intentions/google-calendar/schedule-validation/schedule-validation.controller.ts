import { Controller, Patch, Body, Param, UseGuards, Get } from '@nestjs/common';
import { ScheduleValidationService } from './schedule-validation.service';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ScheduleSettingsDto } from './dto/schedule-validation.dto';
import { AuthGuard } from '../../../auth/auth.guard';

@Controller('agents')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class ScheduleValidationController {
  constructor(private readonly scheduleValidationService: ScheduleValidationService) {}

  @Patch(':agentId/schedule-settings')
  async updateScheduleSettings(
    @Param('agentId') agentId: string,
    @Body() updateDto: Partial<ScheduleSettingsDto>
  ) {
    return this.scheduleValidationService.updateScheduleSettings(agentId, updateDto);
  }

  @Get(':agentId/schedule-settings')
  async getScheduleSettings(
    @Param('agentId') agentId: string
  ): Promise<ScheduleSettingsDto> {
    return this.scheduleValidationService.getScheduleSettings(agentId);
  }
}

