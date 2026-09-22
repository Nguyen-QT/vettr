import { prisma } from "@/lib/prisma";

// Write command (CLAUDE.md 7.3.2): persists the Stripe Refund id and
// flips depositRefunded to true once billing's refundDeposit (7.3.3)
// successfully issues the refund.
export async function recordDepositRefund(
  bookingRequestId: string,
  stripeRefundId: string
): Promise<void> {
  await prisma.bookingRequest.update({
    where: { id: bookingRequestId },
    data: { depositRefunded: true, stripeRefundId },
  });
}
