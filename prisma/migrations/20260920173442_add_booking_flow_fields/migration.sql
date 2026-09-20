-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'AWAITING_SLOT_CONFIRMATION';

-- AlterTable
-- requestedStartTime is nullable at the DB level for now: intake capture
-- (CLAUDE.md 4.1e) hasn't landed yet, so nothing populates it yet. Same
-- pattern as estimatedPrice above it in the model -- enforced by
-- intake.schema.ts once that capture flow exists, not by a DB constraint.
ALTER TABLE "IntakeRequest" ADD COLUMN     "proposedDurationMinutes" INTEGER,
ADD COLUMN     "requestedStartTime" TIMESTAMP(3);
