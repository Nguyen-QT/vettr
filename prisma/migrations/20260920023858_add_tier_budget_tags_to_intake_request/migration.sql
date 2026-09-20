/*
  Warnings:

  - You are about to drop the column `notes` on the `IntakeRequest` table. All the data in the column will be lost.
  - Added the required column `maxPrice` to the `IntakeRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minPrice` to the `IntakeRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tier` to the `IntakeRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ComplexityTier" AS ENUM ('TIER_2', 'TIER_3', 'TIER_4', 'FREESTYLE');

-- AlterTable
ALTER TABLE "IntakeRequest" DROP COLUMN "notes",
ADD COLUMN     "aestheticTags" TEXT[],
ADD COLUMN     "clientNotes" TEXT,
ADD COLUMN     "designTags" TEXT[],
ADD COLUMN     "maxPrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "minPrice" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "tier" "ComplexityTier" NOT NULL,
ALTER COLUMN "estimatedPrice" DROP NOT NULL;
