-- AlterTable: add nullable first so existing Session rows aren't rejected,
-- backfill from the owning Account's home role, then enforce NOT NULL.
ALTER TABLE "Session" ADD COLUMN     "activeRole" "AccountRole";

UPDATE "Session" s
SET "activeRole" = a."role"
FROM "Account" a
WHERE s."accountId" = a.id;

ALTER TABLE "Session" ALTER COLUMN "activeRole" SET NOT NULL;
