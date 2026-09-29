-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "emailVerificationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailVerificationCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationCodeHash" TEXT,
ADD COLUMN     "emailVerificationCodeSentAt" TIMESTAMP(3),
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);
