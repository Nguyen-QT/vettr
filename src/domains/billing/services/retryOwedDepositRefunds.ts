import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
  DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS,
  DEPOSIT_REFUND_RETRY_BACKOFF_MS,
  DEPOSIT_REFUND_RETRY_BATCH_SIZE,
  DEPOSIT_REFUND_RETRY_BUDGET_MS,
  DEPOSIT_REFUND_RETRY_MIN_AGE_MS,
} from "../constants";
import type { RetryOwedDepositRefundsResult } from "../types";
import { reconcileDepositRefundFromStripe } from "./reconcileDepositRefundFromStripe";
import { recordDepositRefundRetry } from "./recordDepositRefundRetry";
import { refundDeposit } from "./refundDeposit";

type OwedRefundOutcome = "RECONCILED" | "REFUNDED" | "FAILED";

interface OwedRefund {
  bookingRequestId: string;
  stripePaymentIntentId: string;
}

// The typed Prisma code only, never its message.
function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

// Reconcile first: the sweep never creates a refund without asking Stripe
// whether one already exists, so a failed list call skips the row this
// run. refundDeposit then refunds under the per-booking key, with the
// PaymentIntent stored on the row. Its generic retryable error was already
// logged. Any other refusal (the booking is missing, unpaid or has no
// PaymentIntent, none of which can happen today) is logged critical.
async function retryOwedRefund({
  bookingRequestId,
  stripePaymentIntentId,
}: OwedRefund): Promise<OwedRefundOutcome> {
  const reconciled = await reconcileDepositRefundFromStripe(
    bookingRequestId,
    stripePaymentIntentId
  );
  if (reconciled === "RECONCILED") {
    return "RECONCILED";
  }
  if (reconciled === "LIST_FAILED") {
    return "FAILED";
  }

  const result = await refundDeposit(bookingRequestId);
  if (result.success) {
    return "REFUNDED";
  }
  if (result.error !== DEPOSIT_REFUND_INIT_ERROR_MESSAGE) {
    console.error({
      operation: "retryOwedDepositRefunds",
      reason: "refund_refused",
      severity: "critical",
      bookingRequestId,
      paymentIntentId: stripePaymentIntentId,
    });
  }
  return "FAILED";
}

// Domain Service (56.7): retries refund intents still PENDING with no
// refund id, which no webhook will ever settle: refunds.create failed, so
// no refund exists on Stripe.
// Candidates are read from billing's own table, oldest updatedAt first,
// at most DEPOSIT_REFUND_RETRY_BATCH_SIZE per run. A row waits until it's
// DEPOSIT_REFUND_RETRY_MIN_AGE_MS old, so the sweep never races the call
// that created it. From DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS visits on, it
// waits DEPOSIT_REFUND_RETRY_BACKOFF_MS. The cutoffs come from the Node
// clock, as Prisma's @updatedAt does, read once per run.
// Rows run in turn. Each is caught on its own and logged with ids only, so
// one that throws (a database error from the reconcile sync or from
// refundDeposit's booking read) doesn't stop the batch. Every visit is then
// counted through recordDepositRefundRetry, in its own try/catch, which
// skips a row that got its refund id and alerts at the threshold.
// No new row starts once the run has taken DEPOSIT_REFUND_RETRY_BUDGET_MS,
// and the rest are deferred to the next run. A failed candidate read isn't
// caught: the caller answers it with a generic error, so the scheduled job
// fails visibly.
export async function retryOwedDepositRefunds(): Promise<RetryOwedDepositRefundsResult> {
  const startedAt = Date.now();

  const candidates = await prisma.depositRefund.findMany({
    where: {
      status: "PENDING",
      stripeRefundId: null,
      OR: [
        {
          retryAttempts: { lt: DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS },
          updatedAt: { lte: new Date(startedAt - DEPOSIT_REFUND_RETRY_MIN_AGE_MS) },
        },
        {
          retryAttempts: { gte: DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS },
          updatedAt: { lte: new Date(startedAt - DEPOSIT_REFUND_RETRY_BACKOFF_MS) },
        },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: DEPOSIT_REFUND_RETRY_BATCH_SIZE,
    select: { bookingRequestId: true, stripePaymentIntentId: true },
  });

  const result: RetryOwedDepositRefundsResult = {
    reconciled: 0,
    refunded: 0,
    failed: 0,
    deferred: 0,
  };

  for (const [index, row] of candidates.entries()) {
    if (Date.now() - startedAt >= DEPOSIT_REFUND_RETRY_BUDGET_MS) {
      result.deferred = candidates.length - index;
      break;
    }

    let outcome: OwedRefundOutcome;
    try {
      outcome = await retryOwedRefund(row);
    } catch (error) {
      // The row stays a candidate; the visit count escalates it.
      console.error({
        operation: "retryOwedDepositRefunds",
        reason: "row_failed",
        severity: "warning",
        bookingRequestId: row.bookingRequestId,
        paymentIntentId: row.stripePaymentIntentId,
        errorCode: prismaErrorCode(error),
      });
      outcome = "FAILED";
    }

    if (outcome === "RECONCILED") {
      result.reconciled += 1;
    } else if (outcome === "REFUNDED") {
      result.refunded += 1;
    } else {
      result.failed += 1;
    }

    try {
      await recordDepositRefundRetry(row.bookingRequestId);
    } catch (error) {
      console.error({
        operation: "retryOwedDepositRefunds",
        reason: "retry_count_failed",
        severity: "warning",
        bookingRequestId: row.bookingRequestId,
        paymentIntentId: row.stripePaymentIntentId,
        errorCode: prismaErrorCode(error),
      });
    }
  }

  return result;
}
