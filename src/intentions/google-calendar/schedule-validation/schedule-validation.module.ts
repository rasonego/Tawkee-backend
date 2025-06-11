import { Module } from '@nestjs/common';
import { ScheduleValidationService } from './schedule-validation.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ScheduleValidationController } from './schedule-validation.controller';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [ScheduleValidationService],
  controllers: [ScheduleValidationController],
  exports: [ScheduleValidationService],
})
export class ScheduleValidationModule {}