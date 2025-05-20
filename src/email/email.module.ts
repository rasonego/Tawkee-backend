import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VerificationService } from './verification.service';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [EmailService, VerificationService, PasswordResetService],
  exports: [EmailService, VerificationService, PasswordResetService],
})
export class EmailModule {}
