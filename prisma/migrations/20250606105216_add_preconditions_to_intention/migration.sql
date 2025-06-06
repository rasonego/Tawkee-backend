-- CreateTable
CREATE TABLE "IntentionPrecondition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "httpMethod" TEXT NOT NULL DEFAULT 'POST',
    "requestBody" TEXT,
    "failureCondition" TEXT NOT NULL,
    "failureMessage" TEXT NOT NULL,
    "intentionId" TEXT NOT NULL,

    CONSTRAINT "IntentionPrecondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentionPreconditionHeader" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "preconditionId" TEXT NOT NULL,

    CONSTRAINT "IntentionPreconditionHeader_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IntentionPrecondition" ADD CONSTRAINT "IntentionPrecondition_intentionId_fkey" FOREIGN KEY ("intentionId") REFERENCES "Intention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentionPreconditionHeader" ADD CONSTRAINT "IntentionPreconditionHeader_preconditionId_fkey" FOREIGN KEY ("preconditionId") REFERENCES "IntentionPrecondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
