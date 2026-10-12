import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";

import type { DepositRefundReconcileOutcome } from "../types";
import { syncDepositRefundStatus } from "./syncDepositRefundStatus";

// Domain Service (56.7): the retry sweep's first step for a refund intent
// still PENDING with no refund id. It asks Stripe whether a refund already
// exists before anything is created. One can exist without its id reaching
// us: refunds.create's response was lost, or refundDeposit's status write
// failed and no webhook came. After Stripe's 24h key window a new create
// would get charge_already_refunded, and if that hidden refund had failed,
// a new one would bypass 56.6's manual recovery rule.
// Lists the PaymentIntent's refunds, newest first, and takes the first
// whose metadata.bookingRequestId (set by refundDeposit) names this
// booking. It goes through syncDepositRefundStatus, the webhook's own
// path, with its status and failure_reason unmapped. A refund with no
// metadata (a Dashboard refund) or another booking's is skipped: the
// webhook already logged it, and passing it on would log it critical on
// every sweep. The per-booking refund key and this check mean at most one
// refund names the booking.
// Only the list call is caught (architecture.md §6.1), logged with ids
// only. A database error from the sync is the call working and the local
// write failing (§6.2), so it reaches the sweep, and the row stays a
// candidate.
export async function reconcileDepositRefundFromStripe(
  bookingRequestId: string,
  stripePaymentIntentId: string
): Promise<DepositRefundReconcileOutcome> {
  let refund: Stripe.Refund | undefined;
  try {
    // Auto-paginates, so a match on a later page is still found.
    for await (const listed of stripe.refunds.list({
      payment_intent: stripePaymentIntentId,
      limit: 100,
    })) {
      if (listed.metadata?.bookingRequestId === bookingRequestId) {
        refund = listed;
        break;
      }
    }
  } catch {
    // Ids only: a Stripe error can carry the whole refund or charge object.
    console.error({
      operation: "reconcileDepositRefundFromStripe",
      reason: "stripe_list_failed",
      severity: "warning",
      bookingRequestId,
      paymentIntentId: stripePaymentIntentId,
    });
    return "LIST_FAILED";
  }

  if (!refund) {
    return "NO_REFUND";
  }

  // The refund exists on Stripe, so this is RECONCILED whether or not the
  // sync writes (a null status, or a webhook that got there first).
  await syncDepositRefundStatus({
    stripeRefundId: refund.id,
    stripePaymentIntentId,
    metadataBookingRequestId: bookingRequestId,
    stripeStatus: refund.status,
    failureReason: refund.failure_reason,
  });
  return "RECONCILED";
}
