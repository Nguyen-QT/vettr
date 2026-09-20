-- Enables the GiST exclusion constraint below (ships as a standard
-- Postgres contrib extension; no external service required).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Database-level guarantee (CLAUDE.md 4.1: "database state checks") that
-- two BOOKED TimeSlots for the same artist can never overlap, enforced by
-- Postgres itself so it holds even under concurrent transactions --
-- application-level checks alone can race between the read and the write.
-- REQUESTED/RELEASED slots are untouched: only allocated (BOOKED) slots
-- are mutually exclusive.
ALTER TABLE "TimeSlot"
  ADD CONSTRAINT "TimeSlot_no_overlapping_booked_slots"
  EXCLUDE USING gist (
    "artistId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE (status = 'BOOKED');
