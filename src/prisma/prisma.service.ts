import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Helper method for transaction
  async executeInTransaction<T>(
    callback: (prisma: PrismaClient) => Promise<T>
  ): Promise<T> {
    return this.$transaction(async (prisma) => {
      return callback(prisma as PrismaClient);
    });
  }
}
