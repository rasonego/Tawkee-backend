import { Module } from '@nestjs/common';
import { WahaApiService } from './waha-api.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [WahaApiService],
  exports: [WahaApiService],
})
export class WahaApiModule {}
