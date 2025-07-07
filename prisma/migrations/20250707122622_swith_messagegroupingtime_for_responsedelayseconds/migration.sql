/*
  Warnings:

  - You are about to drop the column `messageGroupingTime` on the `AgentSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentSettings" DROP COLUMN "messageGroupingTime",
ADD COLUMN     "responseDelaySeconds" INTEGER NOT NULL DEFAULT 5;
