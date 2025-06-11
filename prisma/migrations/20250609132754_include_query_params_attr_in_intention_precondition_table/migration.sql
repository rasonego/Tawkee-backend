-- CreateTable
CREATE TABLE "IntentionPreconditionQueryParam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "preconditionId" TEXT NOT NULL,

    CONSTRAINT "IntentionPreconditionQueryParam_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IntentionPreconditionQueryParam" ADD CONSTRAINT "IntentionPreconditionQueryParam_preconditionId_fkey" FOREIGN KEY ("preconditionId") REFERENCES "IntentionPrecondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
