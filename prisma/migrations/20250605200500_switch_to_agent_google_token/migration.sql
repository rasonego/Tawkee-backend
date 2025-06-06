/*
  Warnings:

  - You are about to drop the `user_google_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_google_tokens" DROP CONSTRAINT "user_google_tokens_userId_fkey";

-- DropTable
DROP TABLE "user_google_tokens";

-- CreateTable
CREATE TABLE "agent_google_tokens" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" BIGINT NOT NULL,
    "scope" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_google_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_google_tokens_agentId_key" ON "agent_google_tokens"("agentId");

-- AddForeignKey
ALTER TABLE "agent_google_tokens" ADD CONSTRAINT "agent_google_tokens_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
