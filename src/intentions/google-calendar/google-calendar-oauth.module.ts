import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarOAuthController } from './google-calendar-oauth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
  ],
  controllers: [GoogleCalendarOAuthController],
  providers: [GoogleCalendarOAuthService],
  exports: [GoogleCalendarOAuthService],
})
export class GoogleCalendarOAuthModule {}