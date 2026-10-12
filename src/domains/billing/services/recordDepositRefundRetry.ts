import { prisma } from "@/lib/prisma";

import { DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS } from "../constants";

// Domain Service (56.7): counts one retry sweep visit to a booking's refund
// intent. The check and the increment are one statement: retryAttempts
// only goes up while the row is still PENDING with no refund id, so a row
// that got its id during the visit (the sweep's own refund, or a webhook)
// isn't counted. The increment also bumps updatedAt, and the sweep reads
// the oldest updatedAt first, so failing rows take turns.
// The increment that returns exactly DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS
// raises the critical alert (53.7), ids only. Postgres serialises
// concurrent increments on the row, so only one caller sees that number
// and the alert fires once. Database errors aren't caught: what they mean
// is the sweep's decision.
export async function recordDepositRefundRetry(bookingRequestId: string): Promise<void> {
  const counted = await prisma.depositRefund.updateManyAndReturn({
    where: { bookingRequestId, status: "PENDING", stripeRefundId: null },
    data: { retryAttempts: { increment: 1 } },
    select: { retryAttempts: true, stripePaymentIntentId: true },
  });

  const row = counted.at(0);
  if (row?.retryAttempts === DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS) {
    console.error({
      operation: "recordDepositRefundRetry",
      reason: "refund_retry_failing",
      severity: "critical",
      bookingRequestId,
      paymentIntentId: row.stripePaymentIntentId,
    });
  }
}
