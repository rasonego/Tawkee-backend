import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { GoogleCalendarOAuthModule } from 'src/intentions/google-calendar/google-calendar-oauth.module';
import { StripeModule } from 'src/stripe/stripe.module';
import { FileModule } from 'src/files/file.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleCalendarOAuthModule,
    ConfigModule,
    EmailModule,
    StripeModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'defaultSecret',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    FileModule
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
