import { Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleSettingsDto } from './dto/schedule-validation.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ScheduleValidationService {
  constructor(private readonly prisma: PrismaService) {}

  isWithinAvailableHours(date: Date, schedule: ScheduleSettingsDto): boolean {
    if (schedule.alwaysOpen) return true;

    const weekday = date
      .toLocaleString('en-US', { weekday: 'long' })
      .toLowerCase();
    const available = schedule.availableTimes?.[weekday];
    if (!available) return false;

    const timeStr = date.toTimeString().slice(0, 5);
    return available.some(([start, end]) => timeStr >= start && timeStr <= end);
  }

  isBeforeMaxAdvance(date: Date, schedule: ScheduleSettingsDto): boolean {
    if (!schedule.maxAdvanceDays) return true;
    const now = new Date();
    return (
      date.getTime() - now.getTime() <=
      schedule.maxAdvanceDays * 24 * 60 * 60 * 1000
    );
  }

  isAfterMinAdvance(date: Date, schedule: ScheduleSettingsDto): boolean {
    if (!schedule.minAdvanceMinutes) return true;
    const now = new Date();
    return date.getTime() - now.getTime() >= schedule.minAdvanceMinutes * 60000;
  }

  isDurationAllowed(
    start: Date,
    end: Date,
    schedule: ScheduleSettingsDto
  ): boolean {
    if (!schedule.maxEventDuration) return true;
    const diffMinutes = (end.getTime() - start.getTime()) / 60000;
    return diffMinutes <= schedule.maxEventDuration;
  }

  validateSchedule(
    start: Date,
    end: Date,
    schedule: ScheduleSettingsDto
  ): string | null {
    if (
      !this.isWithinAvailableHours(start, schedule) ||
      !this.isWithinAvailableHours(end, schedule)
    ) {
      return 'The selected time is outside of the available scheduling hours.';
    }
    if (!this.isAfterMinAdvance(start, schedule)) {
      return `Meetings must be scheduled at least ${schedule.minAdvanceMinutes} minutes in advance.`;
    }
    if (!this.isBeforeMaxAdvance(start, schedule)) {
      return `Meetings cannot be scheduled more than ${schedule.maxAdvanceDays} days in advance.`;
    }
    if (!this.isDurationAllowed(start, end, schedule)) {
      return `Meetings cannot exceed ${schedule.maxEventDuration} minutes.`;
    }
    return null;
  }

  async updateScheduleSettings(
    agentId: string,
    updateDto: Partial<ScheduleSettingsDto>
  ) {
    const existing = await this.prisma.scheduleSettings.findUnique({
      where: { agentId },
    });

    if (!existing) {
      throw new NotFoundException(
        `Schedule settings for agent ${agentId} not found`
      );
    }

    const updatePayload: any = {};

    if (updateDto.email !== undefined) {
      updatePayload.email = updateDto.email;
    }
    if (updateDto.availableTimes !== undefined) {
      updatePayload.availableTimes = updateDto.availableTimes;
    }
    if (updateDto.minAdvanceMinutes !== undefined) {
      updatePayload.minAdvanceMinutes = updateDto.minAdvanceMinutes;
    }
    if (updateDto.maxAdvanceDays !== undefined) {
      updatePayload.maxAdvanceDays = updateDto.maxAdvanceDays;
    }
    if (updateDto.maxEventDuration !== undefined) {
      updatePayload.maxEventDuration = updateDto.maxEventDuration;
    }
    if (updateDto.alwaysOpen !== undefined) {
      updatePayload.alwaysOpen = updateDto.alwaysOpen;
    }
    if (updateDto.askForContactName !== undefined) {
      updatePayload.askForContactName = updateDto.askForContactName;
    }
    if (updateDto.askForContactPhone !== undefined) {
      updatePayload.askForContactPhone = updateDto.askForContactPhone;
    }
    if (updateDto.askForMeetingDuration !== undefined) {
      updatePayload.askForMeetingDuration = updateDto.askForMeetingDuration;
    }

    const updated = await this.prisma.scheduleSettings.update({
      where: { agentId },
      data: updatePayload,
    });

    return updated;
  }

  async getScheduleSettings(agentId: string): Promise<ScheduleSettingsDto> {
    const settings = await this.prisma.scheduleSettings.findUnique({
      where: { agentId },
    });

    if (!settings) {
      throw new NotFoundException(
        `Schedule settings for agent ${agentId} not found`
      );
    }

    return {
      id: settings.id,
      email: settings.email,
      agentId: settings.agentId,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
      availableTimes: settings.availableTimes as any,
      minAdvanceMinutes: settings.minAdvanceMinutes,
      maxAdvanceDays: settings.maxAdvanceDays,
      maxEventDuration: settings.maxEventDuration,
      alwaysOpen: settings.alwaysOpen,
      askForContactName: settings.askForContactName,
      askForContactPhone: settings.askForContactPhone,
      askForMeetingDuration: settings.askForMeetingDuration,
    };
  }
}
