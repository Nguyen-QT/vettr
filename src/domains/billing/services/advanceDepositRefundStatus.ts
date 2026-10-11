import { prisma } from "@/lib/prisma";

import {
  DEPOSIT_REFUND_STATUS_BY_STRIPE_STATUS,
  DEPOSIT_REFUND_STATUSES_BEHIND,
} from "../constants";
import type {
  AdvanceDepositRefundStatusInput,
  DepositRefundStripeStatus,
} from "../types";

function isDepositRefundStripeStatus(status: string): status is DepositRefundStripeStatus {
  return Object.hasOwn(DEPOSIT_REFUND_STATUS_BY_STRIPE_STATUS, status);
}

// Domain Service (56.6): the one write that moves a booking's
// DepositRefund row to the status Stripe reports for its refund.
// refundDeposit writes the status refunds.create returns, and the refund
// webhooks write each event's status. Webhooks are at-least-once and
// unordered, so the row only moves forward in the fixed precedence
// (DEPOSIT_REFUND_STATUSES_BEHIND), never by arrival order. The check and
// the write are one statement: an id-less row (refundDeposit's intent)
// takes this refund id at or behind the new status, and a row already
// holding this id only moves forward. A row holding a different refund
// id matches neither, so its id is never replaced, and a redelivery of
// the status a row already has writes nothing. Returns whether it wrote.
// Every write sets the refund id, so only a PENDING intent row is ever
// id-less: a FAILED write always means the row has just reached FAILED,
// and that write alone raises the critical alert (53.7), so a redelivered
// refund.failed alerts once. A null or unknown Stripe status is logged as
// a warning and writes nothing. Database errors aren't caught (a refund
// id already stored on another booking's row is a P2002): what they mean
// is the caller's decision.
export async function advanceDepositRefundStatus(
  input: AdvanceDepositRefundStatusInput
): Promise<boolean> {
  const { bookingRequestId, stripeRefundId, stripeStatus, failureReason } = input;

  if (stripeStatus === null || !isDepositRefundStripeStatus(stripeStatus)) {
    console.error({
      operation: "advanceDepositRefundStatus",
      reason: "refund_status_unknown",
      severity: "warning",
      bookingRequestId,
      stripeRefundId,
      stripeStatus,
    });
    return false;
  }

  const status = DEPOSIT_REFUND_STATUS_BY_STRIPE_STATUS[stripeStatus];
  const behind = DEPOSIT_REFUND_STATUSES_BEHIND[status];

  const { count } = await prisma.depositRefund.updateMany({
    where: {
      bookingRequestId,
      OR: [
        { stripeRefundId: null, status: { in: [...behind, status] } },
        { stripeRefundId, status: { in: [...behind] } },
      ],
    },
    data: { status, stripeRefundId },
  });

  const written = count > 0;

  if (written && status === "FAILED") {
    // Ids and Stripe's failure_reason (an enum, not PII) only.
    console.error({
      operation: "advanceDepositRefundStatus",
      reason: "refund_failed",
      severity: "critical",
      bookingRequestId,
      stripeRefundId,
      failureReason,
    });
  }

  return written;
}
