/*
  Warnings:

  - The `agentLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `creditsLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `trainingDocumentLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `trainingTextLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `trainingVideoLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `trainingWebsiteLimitOverrides` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "agentLimitOverrides",
ADD COLUMN     "agentLimitOverrides" JSONB,
DROP COLUMN "creditsLimitOverrides",
ADD COLUMN     "creditsLimitOverrides" JSONB,
DROP COLUMN "trainingDocumentLimitOverrides",
ADD COLUMN     "trainingDocumentLimitOverrides" JSONB,
DROP COLUMN "trainingTextLimitOverrides",
ADD COLUMN     "trainingTextLimitOverrides" JSONB,
DROP COLUMN "trainingVideoLimitOverrides",
ADD COLUMN     "trainingVideoLimitOverrides" JSONB,
DROP COLUMN "trainingWebsiteLimitOverrides",
ADD COLUMN     "trainingWebsiteLimitOverrides" JSONB;
