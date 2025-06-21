/*
  Warnings:

  - You are about to drop the column `currency` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `interval` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `intervalCount` on the `plans` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `plans` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "plans" DROP COLUMN "currency",
DROP COLUMN "interval",
DROP COLUMN "intervalCount",
DROP COLUMN "price";

-- DropEnum
DROP TYPE "PlanInterval";
