-- Client-facing advisory field (CLAUDE.md 6.3): an optional "must be
-- finished by" time the client flags on intake, for the artist to
-- weigh during review. Never auto-enforced.
ALTER TABLE "IntakeRequest" ADD COLUMN "clientMaxEndTime" TIMESTAMP(3);
