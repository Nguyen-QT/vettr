import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { confirmDepositPayment } from "@/domains/billing/services/confirmDepositPayment";
import { syncArtistConnectAccountStatus } from "@/domains/billing/services/syncArtistConnectAccountStatus";
import { syncDepositRefundStatus } from "@/domains/billing/services/syncDepositRefundStatus";
import { stripe } from "@/lib/stripe";

// Route Handler (CLAUDE.md 7.1.5, refund handling added 7.3.3-fix):
// dumb delivery only -- verifies the Stripe signature and delegates to
// confirmDepositPayment/syncDepositRefundStatus for the actual business
// logic. Reads the raw request body rather than request.json() since
// Stripe's signature is computed over the exact bytes it sent; a
// re-serialized JSON body would fail verification. The Stripe webhook
// endpoint must subscribe to every event handled below (56.1, 56.6):
// payment_intent.succeeded, payment_intent.payment_failed,
// refund.created, refund.updated, refund.failed and account.updated.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  // A non-2xx response here makes Stripe automatically retry delivery
  // (exponential backoff over several days) -- the deliberate safety
  // net for confirmDepositPayment/syncDepositRefundStatus throwing (e.g.
  // a transient DB error), since both are idempotent and safe to
  // re-run. Explicit try/catch per case rather than relying on an
  // unhandled throw to implicitly produce a 500, so that intent is
  // visible in the code.
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        // metadata.bookingRequestId (set at creation) only tells
        // confirmDepositPayment how loudly to log a PaymentIntent that
        // matches no booking (56.4); it never picks the booking. Read
        // defensively so a log-only field can't fail the confirmation.
        // A not-found result still answers 200: the service has logged
        // it, and a retry can't create a match.
        await confirmDepositPayment(paymentIntent.id, paymentIntent.metadata?.bookingRequestId);
        break;
      }
      case "payment_intent.payment_failed":
        // No failure-handling UI yet (CLAUDE.md 7.1 scope) -- logged so
        // a failed deposit isn't silently invisible, revisited when
        // that surface gets built.
        console.error("Deposit PaymentIntent failed:", event.data.object.id);
        break;
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const refund = event.data.object;
        // Every refund event goes through, whatever its status (56.6):
        // refund.created carries the status a refund starts in,
        // refund.updated a pending refund's success, and only
        // refund.failed carries a failure (56.1 spike). The status and
        // failure_reason pass through unmapped: syncDepositRefundStatus
        // decides what they mean, and a fixed precedence, not arrival
        // order, decides whether the row moves. metadata.bookingRequestId
        // only lets an id-less intent row be matched, never picks a
        // booking on its own, and is missing on a refund made outside the
        // app, so it's read defensively. Webhook objects are never
        // expanded, so payment_intent is an id or null. Nothing written
        // still answers 200: the service logs an unmatched refund, a
        // stale or redelivered one needs nothing, and a retry can't
        // change either.
        await syncDepositRefundStatus({
          stripeRefundId: refund.id,
          stripePaymentIntentId:
            typeof refund.payment_intent === "string" ? refund.payment_intent : null,
          metadataBookingRequestId: refund.metadata?.bookingRequestId,
          stripeStatus: refund.status,
          failureReason: refund.failure_reason,
        });
        break;
      }
      case "account.updated": {
        const account = event.data.object;
        await syncArtistConnectAccountStatus(
          account.id,
          account.charges_enabled,
          account.payouts_enabled
        );
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Stripe webhook handler failed:", event.type, error);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
