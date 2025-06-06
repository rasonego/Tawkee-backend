-- Add the new column without a default (to avoid duplicate values)
ALTER TABLE "Intention" ADD COLUMN "toolName" TEXT;

-- Populate unique values using the ID to ensure no duplicates
UPDATE "Intention" SET "toolName" = CONCAT('tool_', "id");

-- Alter the column to be NOT NULL now that values exist
ALTER TABLE "Intention" ALTER COLUMN "toolName" SET NOT NULL;

-- Create a unique index on the new column
CREATE UNIQUE INDEX "Intention_toolName_key" ON "Intention"("toolName");

-- Optional: create a regular index for lookup performance
CREATE INDEX "Intention_toolName_idx" ON "Intention"("toolName");
