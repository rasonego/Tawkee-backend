-- DropForeignKey
ALTER TABLE "ExtraCreditPurchase" DROP CONSTRAINT "ExtraCreditPurchase_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "SmartRechargeSetting" DROP CONSTRAINT "SmartRechargeSetting_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "UsageRecord" DROP CONSTRAINT "UsageRecord_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_workspaceId_fkey";

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraCreditPurchase" ADD CONSTRAINT "ExtraCreditPurchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartRechargeSetting" ADD CONSTRAINT "SmartRechargeSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
