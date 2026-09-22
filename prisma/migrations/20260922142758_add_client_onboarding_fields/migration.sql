-- Onboarding fields (CLAUDE.md 6.2), nullable so existing rows carry
-- forward untouched -- "required" is enforced by intake.schema.ts for
-- every new submission, not a backfilled placeholder value here.
ALTER TABLE "ClientProfile" ADD COLUMN "firstName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "lastName" TEXT;
ALTER TABLE "ClientProfile" ADD COLUMN "dateOfBirth" DATE;
