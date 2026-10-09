-- 54.8: clients sign in by email code only, and the 27.3 signup
-- verification codes were replaced by EmailOtpChallenge. No real users
-- yet, so remaining CLIENT hashes are discarded, not migrated.
UPDATE "Account" SET "passwordHash" = NULL WHERE "role" = 'CLIENT';

-- Prisma cannot express this; enforced at the database level. An ARTIST
-- row with a NULL hash fails here on purpose (it could never sign in).
ALTER TABLE "Account" ADD CONSTRAINT "Account_passwordHash_role_check"
  CHECK (
    ("role" = 'ARTIST' AND "passwordHash" IS NOT NULL)
    OR ("role" = 'CLIENT' AND "passwordHash" IS NULL)
  );

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "emailVerificationAttempts",
DROP COLUMN "emailVerificationCodeExpiresAt",
DROP COLUMN "emailVerificationCodeHash",
DROP COLUMN "emailVerificationCodeSentAt";
