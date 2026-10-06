-- AlterTable: add nullable first so existing Artist rows aren't rejected,
-- backfill from the Instagram handle, then enforce NOT NULL.
ALTER TABLE "Artist" ADD COLUMN "handle" TEXT;

UPDATE "Artist"
SET "handle" = lower(regexp_replace(btrim("instagramHandle"), '^@', ''));

-- Guard: refuse to silently pick a handle for an artist whose backfilled
-- value collides, is reserved, or would not be a valid /@handle. Surface it
-- as a hard failure so it gets resolved by hand (mirrors
-- 20260923231158_clientprofile_email_unique).
DO $$
DECLARE
  bad_handle TEXT;
BEGIN
  SELECT "handle" INTO bad_handle
  FROM "Artist"
  GROUP BY "handle"
  HAVING count(*) > 1
  LIMIT 1;

  IF bad_handle IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill Artist.handle: "%" is shared by multiple artists', bad_handle;
  END IF;

  SELECT "handle" INTO bad_handle
  FROM "Artist"
  WHERE "handle" IN (
      'admin', 'api', 'artist', 'artists', 'at', 'book', 'client', 'help',
      'login', 'logout', 'settings', 'signup', 'static', 'support', 'vettr',
      'www', '_next'
    )
    OR "handle" LIKE '%.rsc'
  LIMIT 1;

  IF bad_handle IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill Artist.handle: "%" is a reserved handle', bad_handle;
  END IF;

  SELECT "handle" INTO bad_handle
  FROM "Artist"
  WHERE "handle" !~ '^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$'
  LIMIT 1;

  IF bad_handle IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill Artist.handle: "%" is not a valid handle', bad_handle;
  END IF;
END $$;

ALTER TABLE "Artist" ALTER COLUMN "handle" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Artist_handle_key" ON "Artist"("handle");

-- Prisma cannot express these; enforced at the database level.
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_handle_lowercase_check"
  CHECK ("handle" = lower("handle"));
ALTER TABLE "Artist" ADD CONSTRAINT "Artist_handle_format_check"
  CHECK ("handle" ~ '^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$');
