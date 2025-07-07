/*
  Warnings:

  - The values [THIRD_SECONDS] on the enum `ResponseDelayOptions` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ResponseDelayOptions_new" AS ENUM ('IMMEDIATELY', 'FIVE_SECONDS', 'TEN_SECONDS', 'THIRTY_SECONDS', 'ONE_MINUTE');
ALTER TABLE "AgentSettings" ALTER COLUMN "responseDelaySeconds" DROP DEFAULT;
ALTER TABLE "AgentSettings" ALTER COLUMN "responseDelaySeconds" TYPE "ResponseDelayOptions_new" USING ("responseDelaySeconds"::text::"ResponseDelayOptions_new");
ALTER TYPE "ResponseDelayOptions" RENAME TO "ResponseDelayOptions_old";
ALTER TYPE "ResponseDelayOptions_new" RENAME TO "ResponseDelayOptions";
DROP TYPE "ResponseDelayOptions_old";
ALTER TABLE "AgentSettings" ALTER COLUMN "responseDelaySeconds" SET DEFAULT 'FIVE_SECONDS';
COMMIT;
