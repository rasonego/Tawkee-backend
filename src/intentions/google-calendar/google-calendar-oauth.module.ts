import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarOAuthController } from './google-calendar-oauth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ScheduleValidationModule } from './schedule-validation/schedule-validation.module';
import { IntentionsModule } from '../intentions.module';
import { WebsocketModule } from 'src/websocket/websocket.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    ScheduleValidationModule,
    IntentionsModule,
    WebsocketModule,
  ],
  controllers: [GoogleCalendarOAuthController],
  providers: [GoogleCalendarOAuthService],
  exports: [GoogleCalendarOAuthService],
})
export class GoogleCalendarOAuthModule {}
