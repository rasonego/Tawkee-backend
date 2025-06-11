-- AlterTable
ALTER TABLE "AgentSettings" ADD COLUMN     "alwaysRespondWithAudio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "respondAudioWithAudio" BOOLEAN NOT NULL DEFAULT false;
