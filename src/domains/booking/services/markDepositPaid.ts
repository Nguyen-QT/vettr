import { prisma } from "@/lib/prisma";

// Write command (CLAUDE.md 7.2.3): flips depositPaid to true once
// billing's Stripe webhook confirms the PaymentIntent succeeded.
export async function markDepositPaid(bookingRequestId: string): Promise<void> {
  await prisma.bookingRequest.update({
    where: { id: bookingRequestId },
    data: { depositPaid: true },
  });
}
