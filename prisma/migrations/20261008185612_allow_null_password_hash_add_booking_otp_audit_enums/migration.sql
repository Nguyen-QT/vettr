-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'EMAIL_OTP_BOOKING_VERIFICATION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditReasonCode" ADD VALUE 'CLIENT_ACCOUNT_AND_PROFILE_CREATED';
ALTER TYPE "AuditReasonCode" ADD VALUE 'CLIENT_ACCOUNT_LINKED_TO_EXISTING_PROFILE';
ALTER TYPE "AuditReasonCode" ADD VALUE 'INSTAGRAM_HANDLE_TAKEN';

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "passwordHash" DROP NOT NULL;
