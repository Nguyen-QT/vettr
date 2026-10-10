import { stripe } from "@/lib/stripe";

import { DEPOSIT_PAYMENT_INTENT_CANCEL_IDEMPOTENCY_KEY_PREFIX } from "../constants";

// Domain Service (56.4): cancels a deposit PaymentIntent so it can no
// longer be paid, and returns whether Stripe confirmed it.
// createDepositPaymentIntent cancels the stored PaymentIntent before
// replacing one whose amount or routing changed, and only replaces it on
// true. Booking's cancel paths cancel an unpaid booking's PaymentIntent
// after commit, as an optimisation (56.2's late-payment refund is the
// guarantee). Stripe refuses to cancel a PaymentIntent that is processing
// or has succeeded, so false is also what stops a paid one being replaced.
// Never throws (architecture.md §6.1) and writes nothing locally: what a
// failure means is the caller's decision.
export async function cancelDepositPaymentIntent(paymentIntentId: string): Promise<boolean> {
  try {
    await stripe.paymentIntents.cancel(
      paymentIntentId,
      // No cancellation_reason: every caller sends the same empty params,
      // so the shared key below never trips Stripe's mismatched-parameters
      // idempotency error.
      {},
      {
        // Two tabs, or a replace racing a booking cancel, cancelling the
        // same PaymentIntent get Stripe's cached result (within its 24h
        // key window) instead of the second call failing on an
        // already-cancelled PaymentIntent.
        idempotencyKey: `${DEPOSIT_PAYMENT_INTENT_CANCEL_IDEMPOTENCY_KEY_PREFIX}:${paymentIntentId}`,
      }
    );
    return true;
  } catch {
    // Ids only: a Stripe error can carry the whole PaymentIntent object,
    // metadata included.
    console.error({
      operation: "cancelDepositPaymentIntent",
      reason: "stripe_cancel_failed",
      severity: "warning",
      paymentIntentId,
    });
    return false;
  }
}
