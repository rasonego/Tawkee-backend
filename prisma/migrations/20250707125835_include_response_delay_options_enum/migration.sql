/*
  Warnings:

  - The `responseDelaySeconds` column on the `AgentSettings` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "ResponseDelayOptions" AS ENUM ('IMMEDIATELY', 'FIVE_SECONDS', 'TEN_SECONDS', 'THIRD_SECONDS', 'ONE_MINUTE');

-- AlterTable
ALTER TABLE "AgentSettings" DROP COLUMN "responseDelaySeconds",
ADD COLUMN     "responseDelaySeconds" "ResponseDelayOptions" NOT NULL DEFAULT 'FIVE_SECONDS';

-- DropEnum
DROP TYPE "GroupingTime";
