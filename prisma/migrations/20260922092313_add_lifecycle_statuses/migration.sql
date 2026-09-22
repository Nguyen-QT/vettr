-- Renames the existing CANCELLED value in place so already-cancelled
-- rows carry their history forward as CANCELLED_BY_CLIENT (the only
-- path that ever set CANCELLED), instead of the drop+recreate Prisma's
-- naive diff would otherwise generate.
ALTER TYPE "RequestStatus" RENAME VALUE 'CANCELLED' TO 'CANCELLED_BY_CLIENT';

-- New lifecycle transitions (CLAUDE.md 5.6): artist-initiated
-- cancellation of an APPROVED booking, and marking a past-dated
-- APPROVED appointment as a no-show.
ALTER TYPE "RequestStatus" ADD VALUE 'CANCELLED_BY_ARTIST' AFTER 'CANCELLED_BY_CLIENT';
ALTER TYPE "RequestStatus" ADD VALUE 'NO_SHOW' AFTER 'CANCELLED_BY_ARTIST';
