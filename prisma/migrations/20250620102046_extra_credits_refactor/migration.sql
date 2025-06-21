/*
  Warnings:

  - You are about to drop the column `stripePaymentId` on the `ExtraCreditPurchase` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CreditRechargeMethod" AS ENUM ('MANUAL', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "ExtraCreditPurchase" DROP COLUMN "stripePaymentId",
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "source" "CreditRechargeMethod" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "stripeInvoiceId" TEXT,
ADD COLUMN     "stripeInvoiceItemId" TEXT;
