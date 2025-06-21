-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "trainingDocumentLimit" INTEGER,
ADD COLUMN     "trainingTextLimit" INTEGER,
ADD COLUMN     "trainingVideoLimit" INTEGER,
ADD COLUMN     "trainingWebsiteLimit" INTEGER;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "customStripePriceId" TEXT,
ADD COLUMN     "featureOverrides" JSONB;
