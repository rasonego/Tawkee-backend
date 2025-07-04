-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "lastPaymentFailedAt" TIMESTAMP(3),
ADD COLUMN     "paymentRetryCount" INTEGER NOT NULL DEFAULT 0;
