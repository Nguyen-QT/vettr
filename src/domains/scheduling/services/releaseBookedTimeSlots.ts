import type { Prisma } from "@/generated/prisma/client";

type PrismaTransactionClient = Prisma.TransactionClient;

// The transaction-composable mirror of createBookedTimeSlots
// (confirmTimeSlot.ts): releases every BOOKED TimeSlot row for a
// request back to RELEASED, against whatever transaction client the
// caller supplies (CLAUDE.md 7.2.1). Exported so booking's
// cancelBookingRequest/cancelApprovedBookingAsArtist/
// rescheduleApprovedBooking can stop reaching directly into
// tx.timeSlot.updateMany themselves (CLAUDE.md's Domain Boundary
// Isolation rule) -- those callers switch over in 7.2.2.
export async function releaseBookedTimeSlots(
  tx: PrismaTransactionClient,
  bookingRequestId: string
): Promise<void> {
  await tx.timeSlot.updateMany({
    where: { bookingRequestId, status: "BOOKED" },
    data: { status: "RELEASED" },
  });
}
