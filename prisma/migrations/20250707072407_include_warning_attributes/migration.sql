-- AlterTable
ALTER TABLE "AgentSettings" ADD COLUMN     "reminderIntervalMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Interaction" ADD COLUMN     "warnedAt" TIMESTAMP(3);
