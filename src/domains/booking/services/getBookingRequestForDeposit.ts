import { prisma } from "@/lib/prisma";

import type { BookingRequestDepositView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's createDepositPaymentIntent needs, without billing ever
// querying BookingRequest directly. clientEnforcePrecharge (CLAUDE.md
// 7.4) joins ClientProfile.enforcePrecharge in here rather than
// billing querying ClientProfile itself, same reasoning.
export async function getBookingRequestForDeposit(
  bookingRequestId: string
): Promise<BookingRequestDepositView | null> {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: bookingRequestId },
    select: {
      id: true,
      clientId: true,
      artistId: true,
      tier: true,
      status: true,
      depositPaid: true,
      stripePaymentIntentId: true,
      depositRefunded: true,
      estimatedPrice: true,
      client: { select: { enforcePrecharge: true } },
    },
  });

  if (!request) {
    return null;
  }

  const { client, estimatedPrice, ...rest } = request;
  return {
    ...rest,
    estimatedPrice: estimatedPrice === null ? null : Number(estimatedPrice),
    clientEnforcePrecharge: client.enforcePrecharge,
  };
}
