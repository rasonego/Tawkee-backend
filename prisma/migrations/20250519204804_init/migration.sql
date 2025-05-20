-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('FORMAL', 'NORMAL', 'RELAXED');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SUPPORT', 'SALE', 'PERSONAL');

-- CreateEnum
CREATE TYPE "AIModel" AS ENUM ('GPT_4_1', 'GPT_4_1_MINI', 'GPT_4_O_MINI', 'GPT_4_O', 'OPEN_AI_O3_MINI', 'OPEN_AI_O4_MINI', 'OPEN_AI_O3', 'OPEN_AI_O1', 'GPT_4', 'CLAUDE_3_5_SONNET', 'CLAUDE_3_7_SONNET', 'CLAUDE_3_5_HAIKU', 'DEEPINFRA_LLAMA3_3', 'QWEN_2_5_MAX', 'DEEPSEEK_CHAT', 'SABIA_3');

-- CreateEnum
CREATE TYPE "GroupingTime" AS ENUM ('NO_GROUP', 'FIVE_SEC', 'TEN_SEC', 'THIRD_SEC', 'ONE_MINUTE');

-- CreateEnum
CREATE TYPE "TrainingType" AS ENUM ('TEXT', 'WEBSITE', 'VIDEO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "PreprocessingType" AS ENUM ('DISABLED', 'GENERATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'URL', 'DATE_TIME', 'DATE', 'NUMBER', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('RUNNING', 'WAITING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'TELEGRAM', 'MESSENGER', 'INSTAGRAM', 'WEBCHAT', 'EMAIL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatar" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "facebookId" TEXT,
    "firstName" TEXT,
    "googleId" TEXT,
    "lastName" TEXT,
    "provider" TEXT,
    "providerId" TEXT,
    "resetExpires" TIMESTAMP(3),
    "resetToken" TEXT,
    "verificationExpires" TIMESTAMP(3),
    "verificationToken" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "behavior" TEXT,
    "avatar" TEXT,
    "communicationType" "CommunicationType",
    "type" "AgentType",
    "jobName" TEXT,
    "jobSite" TEXT,
    "jobDescription" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSettings" (
    "id" TEXT NOT NULL,
    "preferredModel" "AIModel" NOT NULL DEFAULT 'GPT_4_1',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabledHumanTransfer" BOOLEAN NOT NULL DEFAULT true,
    "enabledReminder" BOOLEAN NOT NULL DEFAULT true,
    "splitMessages" BOOLEAN NOT NULL DEFAULT true,
    "enabledEmoji" BOOLEAN NOT NULL DEFAULT true,
    "limitSubjects" BOOLEAN NOT NULL DEFAULT true,
    "messageGroupingTime" "GroupingTime" NOT NULL DEFAULT 'NO_GROUP',
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWebhooks" (
    "id" TEXT NOT NULL,
    "onNewMessage" TEXT,
    "onLackKnowLedge" TEXT,
    "onTransfer" TEXT,
    "onFinishAttendance" TEXT,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWebhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "type" "TrainingType" NOT NULL,
    "text" TEXT,
    "image" TEXT,
    "website" TEXT,
    "trainingSubPages" TEXT DEFAULT 'DISABLED',
    "trainingInterval" TEXT,
    "video" TEXT,
    "documentUrl" TEXT,
    "documentName" TEXT,
    "documentMimetype" TEXT,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intention" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preprocessingMessage" "PreprocessingType" NOT NULL DEFAULT 'DISABLED',
    "preprocessingText" TEXT,
    "type" TEXT NOT NULL DEFAULT 'WEBHOOK',
    "httpMethod" TEXT NOT NULL DEFAULT 'GET',
    "url" TEXT,
    "requestBody" TEXT,
    "autoGenerateParams" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerateBody" BOOLEAN NOT NULL DEFAULT true,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentionField" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jsonName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "intentionId" TEXT NOT NULL,

    CONSTRAINT "IntentionField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentionHeader" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "intentionId" TEXT NOT NULL,

    CONSTRAINT "IntentionHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentionParam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "intentionId" TEXT NOT NULL,

    CONSTRAINT "IntentionParam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditSpent" (
    "id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditSpent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "name" TEXT,
    "contextId" TEXT NOT NULL,
    "userName" TEXT,
    "userPicture" TEXT,
    "whatsappPhone" TEXT,
    "humanTalk" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT true,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "unReadCount" INTEGER NOT NULL DEFAULT 0,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'RUNNING',
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transferAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "userId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "text" TEXT,
    "role" TEXT NOT NULL,
    "userName" TEXT,
    "userPicture" TEXT,
    "type" TEXT,
    "imageUrl" TEXT,
    "audioUrl" TEXT,
    "documentUrl" TEXT,
    "fileName" TEXT,
    "midiaContent" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "whatsappMessageId" TEXT,
    "whatsappStatus" TEXT,
    "whatsappTimestamp" BIGINT,
    "sentToEvolution" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "chatId" TEXT NOT NULL,
    "interactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "time" BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM now()) * (1000)::numeric),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "rawData" JSONB NOT NULL,
    "destination" TEXT,
    "dateTime" TIMESTAMP(3) NOT NULL,
    "sender" TEXT,
    "serverUrl" TEXT,
    "apikey" TEXT,
    "remoteJid" TEXT,
    "fromMe" BOOLEAN,
    "messageId" TEXT,
    "pushName" TEXT,
    "messageType" TEXT,
    "messageContent" TEXT,
    "messageTimestamp" BIGINT,
    "mediaUrl" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "channelId" TEXT NOT NULL,
    "relatedMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlacklistedToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlacklistedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_StatusUpdates" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_StatusUpdates_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_key" ON "User"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_provider_providerId_idx" ON "User"("provider", "providerId");

-- CreateIndex
CREATE INDEX "User_verificationToken_idx" ON "User"("verificationToken");

-- CreateIndex
CREATE INDEX "User_resetToken_idx" ON "User"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSettings_agentId_key" ON "AgentSettings"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWebhooks_agentId_key" ON "AgentWebhooks"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Chat_contextId_key" ON "Chat"("contextId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_whatsappMessageId_key" ON "Message"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Message_whatsappMessageId_idx" ON "Message"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_relatedMessageId_key" ON "WebhookEvent"("relatedMessageId");

-- CreateIndex
CREATE INDEX "WebhookEvent_remoteJid_processed_idx" ON "WebhookEvent"("remoteJid", "processed");

-- CreateIndex
CREATE INDEX "WebhookEvent_channelId_processed_idx" ON "WebhookEvent"("channelId", "processed");

-- CreateIndex
CREATE INDEX "WebhookEvent_messageId_idx" ON "WebhookEvent"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "BlacklistedToken_token_key" ON "BlacklistedToken"("token");

-- CreateIndex
CREATE INDEX "BlacklistedToken_token_idx" ON "BlacklistedToken"("token");

-- CreateIndex
CREATE INDEX "BlacklistedToken_expiresAt_idx" ON "BlacklistedToken"("expiresAt");

-- CreateIndex
CREATE INDEX "_StatusUpdates_B_index" ON "_StatusUpdates"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSettings" ADD CONSTRAINT "AgentSettings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentWebhooks" ADD CONSTRAINT "AgentWebhooks_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intention" ADD CONSTRAINT "Intention_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentionField" ADD CONSTRAINT "IntentionField_intentionId_fkey" FOREIGN KEY ("intentionId") REFERENCES "Intention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentionHeader" ADD CONSTRAINT "IntentionHeader_intentionId_fkey" FOREIGN KEY ("intentionId") REFERENCES "Intention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentionParam" ADD CONSTRAINT "IntentionParam_intentionId_fkey" FOREIGN KEY ("intentionId") REFERENCES "Intention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSpent" ADD CONSTRAINT "CreditSpent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "Interaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_relatedMessageId_fkey" FOREIGN KEY ("relatedMessageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StatusUpdates" ADD CONSTRAINT "_StatusUpdates_A_fkey" FOREIGN KEY ("A") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StatusUpdates" ADD CONSTRAINT "_StatusUpdates_B_fkey" FOREIGN KEY ("B") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
