/*
  Warnings:

  - You are about to drop the column `alwaysRespondWithAudio` on the `AgentSettings` table. All the data in the column will be lost.
  - You are about to drop the column `elevenLabsApiKey` on the `AgentSettings` table. All the data in the column will be lost.
  - You are about to drop the column `respondAudioWithAudio` on the `AgentSettings` table. All the data in the column will be lost.
  - You are about to drop the column `selectedElevenLabsVoiceId` on the `AgentSettings` table. All the data in the column will be lost.
  - You are about to drop the column `similarityBoost` on the `AgentSettings` table. All the data in the column will be lost.
  - You are about to drop the column `stability` on the `AgentSettings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AgentSettings" DROP COLUMN "alwaysRespondWithAudio",
DROP COLUMN "elevenLabsApiKey",
DROP COLUMN "respondAudioWithAudio",
DROP COLUMN "selectedElevenLabsVoiceId",
DROP COLUMN "similarityBoost",
DROP COLUMN "stability";

-- CreateTable
CREATE TABLE "ElevenLabsSettings" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondAudioWithAudio" BOOLEAN NOT NULL DEFAULT false,
    "alwaysRespondWithAudio" BOOLEAN NOT NULL DEFAULT false,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "similarityBoost" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "selectedElevenLabsVoiceId" TEXT,
    "subscriptionTier" TEXT NOT NULL,
    "characterCount" INTEGER NOT NULL,
    "characterLimit" INTEGER NOT NULL,
    "userName" TEXT NOT NULL,
    "elevenLabsApiKey" TEXT,

    CONSTRAINT "ElevenLabsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ElevenLabsSettings_agentId_key" ON "ElevenLabsSettings"("agentId");

-- AddForeignKey
ALTER TABLE "ElevenLabsSettings" ADD CONSTRAINT "ElevenLabsSettings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
