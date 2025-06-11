-- AlterTable
ALTER TABLE "ScheduleSettings" ADD COLUMN     "askForContactName" BOOLEAN DEFAULT false,
ADD COLUMN     "askForContactPhone" BOOLEAN DEFAULT false,
ADD COLUMN     "askForMeetingDuration" BOOLEAN DEFAULT false;
