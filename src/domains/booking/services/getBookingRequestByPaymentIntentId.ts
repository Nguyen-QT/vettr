import { prisma } from "@/lib/prisma";

import type { BookingRequestDepositView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's confirmDepositPayment needs when the Stripe webhook
// reports a PaymentIntent id. stripePaymentIntentId isn't a DB-level
// unique constraint (CLAUDE.md 7.1.1), so this uses findFirst rather
// than findUnique -- Stripe's PaymentIntent ids are globally unique
// and recordDepositPaymentIntent only ever sets this field once per
// request, so this is safe in practice.
export async function getBookingRequestByPaymentIntentId(
  stripePaymentIntentId: string
): Promise<BookingRequestDepositView | null> {
  return prisma.bookingRequest.findFirst({
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
    },
  });
}
