import { prisma } from "@/lib/prisma";

import type { DepositRefundStatuses } from "../types";

// Domain Service (56.6): each booking's deposit refund status, for the
// client dashboard's refund labels. Reads only billing's DepositRefund
// table -- takes booking ids as input (the client's own, from booking's
// session-scoped getClientBookings) rather than querying BookingRequest
// itself, and doesn't check who owns them; the caller (the client
// dashboard page) composes both reads. One batched query for every
// booking, returning statuses only, never Stripe ids. Database errors
// aren't caught: what they mean is the caller's decision.
export async function getDepositRefundStatuses(
  bookingRequestIds: string[]
): Promise<DepositRefundStatuses> {
  if (bookingRequestIds.length === 0) {
    return {};
  }

  const refunds = await prisma.depositRefund.findMany({
    where: { bookingRequestId: { in: bookingRequestIds } },
    select: { bookingRequestId: true, status: true },
  });

  const result: DepositRefundStatuses = {};
  for (const refund of refunds) {
    result[refund.bookingRequestId] = refund.status;
  }
  return result;
}
