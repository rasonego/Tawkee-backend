/*
  Warnings:

  - You are about to drop the column `credits` on the `Workspace` table. All the data in the column will be lost.
  - You are about to drop the `CreditSpent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CreditTransaction` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `requestType` on the `usage_records` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('API_CALL');

-- DropForeignKey
ALTER TABLE "CreditSpent" DROP CONSTRAINT "CreditSpent_agentId_fkey";

-- DropForeignKey
ALTER TABLE "CreditTransaction" DROP CONSTRAINT "CreditTransaction_agentId_fkey";

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "credits";

-- AlterTable
ALTER TABLE "usage_records" ADD COLUMN     "agentId" TEXT,
DROP COLUMN "requestType",
ADD COLUMN     "requestType" "RequestType" NOT NULL;

-- DropTable
DROP TABLE "CreditSpent";

-- DropTable
DROP TABLE "CreditTransaction";

-- CreateIndex
CREATE INDEX "usage_records_agentId_createdAt_idx" ON "usage_records"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
