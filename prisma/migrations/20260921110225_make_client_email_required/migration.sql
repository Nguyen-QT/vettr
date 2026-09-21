/*
  Warnings:

  - Made the column `email` on table `ClientProfile` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ClientProfile" ALTER COLUMN "email" SET NOT NULL;
