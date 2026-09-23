import { prisma } from "@/lib/prisma";

import type { BookingRequestCheckoutView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.5.2) -- exposes only what
// billing's day-of checkout flow needs, without billing ever querying
// BookingRequest directly. Mirrors getBookingRequestForDeposit's shape.
export async function getBookingRequestForCheckout(
  bookingRequestId: string
): Promise<BookingRequestCheckoutView | null> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    select: {
      id: true,
      artistId: true,
      status: true,
      estimatedPrice: true,
      depositAmount: true,
      depositPaid: true,
    },
  });

  if (!request) {
    return null;
  }

  return {
    ...request,
    estimatedPrice:
      request.estimatedPrice === null ? null : Number(request.estimatedPrice),
    depositAmount:
      request.depositAmount === null ? null : Number(request.depositAmount),
  };
}
