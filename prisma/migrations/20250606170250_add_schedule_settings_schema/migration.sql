-- CreateTable
CREATE TABLE "ScheduleSettings" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "availableTimes" JSONB NOT NULL,
    "minAdvanceMinutes" INTEGER,
    "maxEventDuration" INTEGER,
    "alwaysOpen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleSettings_agentId_key" ON "ScheduleSettings"("agentId");

-- AddForeignKey
ALTER TABLE "ScheduleSettings" ADD CONSTRAINT "ScheduleSettings_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
