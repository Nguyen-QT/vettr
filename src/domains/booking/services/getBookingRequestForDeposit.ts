import { prisma } from "@/lib/prisma";

import type { BookingRequestDepositView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's createDepositPaymentIntent needs, without billing ever
// querying BookingRequest directly.
export async function getBookingRequestForDeposit(
  bookingRequestId: string
): Promise<BookingRequestDepositView | null> {
  return prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    select: {
      id: true,
      clientId: true,
      artistId: true,
      tier: true,
      status: true,
      depositPaid: true,
    },
  });
}
