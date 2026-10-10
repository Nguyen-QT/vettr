import { prisma } from "@/lib/prisma";

import type { BookingRequestDepositView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's confirmDepositPayment needs when the Stripe webhook
// reports a PaymentIntent id. stripePaymentIntentId is unique (56.3),
// so this resolves to at most one request.
export async function getBookingRequestByPaymentIntentId(
  stripePaymentIntentId: string
): Promise<BookingRequestDepositView | null> {
  const request = await prisma.bookingRequest.findUnique({
    where: { stripePaymentIntentId },
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
