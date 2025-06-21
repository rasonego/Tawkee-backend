-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "agentLimitOverrides" INTEGER,
ADD COLUMN     "creditsLimitOverrides" INTEGER,
ADD COLUMN     "trainingDocumentLimitOverrides" INTEGER,
ADD COLUMN     "trainingTextLimitOverrides" INTEGER,
ADD COLUMN     "trainingVideoLimitOverrides" INTEGER,
ADD COLUMN     "trainingWebsiteLimitOverrides" INTEGER;
