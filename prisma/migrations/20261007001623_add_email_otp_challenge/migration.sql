-- CreateEnum
CREATE TYPE "EmailOtpPurpose" AS ENUM ('CLIENT_SIGN_IN', 'BOOKING_SUBMISSION');

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'EMAIL_OTP_SIGN_IN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditReasonCode" ADD VALUE 'INVALID_EMAIL_OTP';
ALTER TYPE "AuditReasonCode" ADD VALUE 'SIGNED_IN_WITH_EMAIL_OTP';

-- CreateTable
CREATE TABLE "EmailOtpChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "EmailOtpPurpose" NOT NULL,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "windowSendCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOtpChallenge_email_key" ON "EmailOtpChallenge"("email");

-- CreateIndex
CREATE INDEX "EmailOtpChallenge_sentAt_idx" ON "EmailOtpChallenge"("sentAt");

-- Prisma cannot express this; enforced at the database level.
ALTER TABLE "EmailOtpChallenge" ADD CONSTRAINT "EmailOtpChallenge_email_lowercase_check"
  CHECK ("email" = lower("email"));
