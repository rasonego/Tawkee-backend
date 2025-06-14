/*
  Warnings:

  - You are about to drop the column `midiaContent` on the `Message` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "midiaContent",
ADD COLUMN     "mediaContent" TEXT,
ADD COLUMN     "mimetype" TEXT;
