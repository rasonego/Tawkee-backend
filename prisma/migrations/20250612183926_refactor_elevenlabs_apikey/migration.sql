/*
  Warnings:

  - You are about to drop the column `ElevenLabsApiKey` on the `AgentSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentSettings" DROP COLUMN "ElevenLabsApiKey",
ADD COLUMN     "elevenLabsApiKey" TEXT;
