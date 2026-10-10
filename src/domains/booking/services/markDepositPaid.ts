import { prisma } from "@/lib/prisma";

import type { RequestStatus } from "../types";

// Write command (CLAUDE.md 7.2.3): flips depositPaid to true once
// billing's Stripe webhook confirms the PaymentIntent succeeded.
// Returns the status read back from this same update, not the caller's
// earlier read (56.2), so a cancel or decline that committed in between
// is seen.
export async function markDepositPaid(bookingRequestId: string): Promise<RequestStatus> {
  const request = await prisma.bookingRequest.update({
    where: { id: bookingRequestId },
    data: { depositPaid: true },
    select: { status: true },
  });

  return request.status;
}
