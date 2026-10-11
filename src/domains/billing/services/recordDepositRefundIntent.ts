import { prisma } from "@/lib/prisma";

import type { DepositRefundIntent } from "../types";

// Domain Service (56.6): records that a booking's deposit is being refunded
// before refundDeposit calls Stripe (architecture.md §6.2). Inserts a
// PENDING row with no refund id unless the booking already has one, then
// reads back whichever row is there. The insert is one INSERT ... ON
// CONFLICT DO NOTHING, so concurrent callers never collide on the
// bookingRequestId index: they all read back the same row, and an existing
// row is left untouched. The row's own PaymentIntent is returned, so every
// attempt refunds the one the first attempt recorded and the per-booking
// idempotency key always carries the same parameters. Database errors
// aren't caught: what they mean is refundDeposit's decision.
export async function recordDepositRefundIntent(
  bookingRequestId: string,
  stripePaymentIntentId: string
): Promise<DepositRefundIntent> {
  await prisma.depositRefund.createMany({
    data: [{ bookingRequestId, stripePaymentIntentId }],
    skipDuplicates: true,
  });

  return prisma.depositRefund.findUniqueOrThrow({
    where: { bookingRequestId },
    select: { stripePaymentIntentId: true, stripeRefundId: true },
  });
}
