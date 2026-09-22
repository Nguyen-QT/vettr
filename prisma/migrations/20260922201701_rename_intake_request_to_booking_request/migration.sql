-- Domain rename (project preference): "Intake" -> "Booking" throughout
-- the codebase. RENAME TO/RENAME COLUMN/RENAME CONSTRAINT rather than
-- DROP + CREATE, so existing rows and their history carry forward
-- untouched -- same reasoning as the RequestStatus RENAME VALUE
-- migration (CLAUDE.md 5.6.1).

ALTER TABLE "IntakeRequest" RENAME TO "BookingRequest";
ALTER TABLE "BookingRequest" RENAME CONSTRAINT "IntakeRequest_pkey" TO "BookingRequest_pkey";
ALTER TABLE "BookingRequest" RENAME CONSTRAINT "IntakeRequest_artistId_fkey" TO "BookingRequest_artistId_fkey";
ALTER TABLE "BookingRequest" RENAME CONSTRAINT "IntakeRequest_clientId_fkey" TO "BookingRequest_clientId_fkey";

ALTER TABLE "DesignReference" RENAME COLUMN "intakeRequestId" TO "bookingRequestId";
ALTER TABLE "DesignReference" RENAME CONSTRAINT "DesignReference_intakeRequestId_fkey" TO "DesignReference_bookingRequestId_fkey";

ALTER TABLE "Addon" RENAME COLUMN "intakeRequestId" TO "bookingRequestId";
ALTER TABLE "Addon" RENAME CONSTRAINT "Addon_intakeRequestId_fkey" TO "Addon_bookingRequestId_fkey";

ALTER TABLE "TimeSlot" RENAME COLUMN "intakeRequestId" TO "bookingRequestId";
ALTER TABLE "TimeSlot" RENAME CONSTRAINT "TimeSlot_intakeRequestId_fkey" TO "TimeSlot_bookingRequestId_fkey";
