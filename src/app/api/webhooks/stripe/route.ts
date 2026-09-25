import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { confirmDepositPayment } from "@/domains/billing/services/confirmDepositPayment";
import { confirmDepositRefund } from "@/domains/billing/services/confirmDepositRefund";
import { syncArtistConnectAccountStatus } from "@/domains/billing/services/syncArtistConnectAccountStatus";
import { stripe } from "@/lib/stripe";

// Route Handler (CLAUDE.md 7.1.5, refund handling added 7.3.3-fix):
// dumb delivery only -- verifies the Stripe signature and delegates to
// confirmDepositPayment/confirmDepositRefund for the actual business
// logic. Reads the raw request body rather than request.json() since
// Stripe's signature is computed over the exact bytes it sent; a
// re-serialized JSON body would fail verification.
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
  // net for confirmDepositPayment/confirmDepositRefund throwing (e.g.
  // a transient DB error), since both are idempotent and safe to
  // re-run. Explicit try/catch per case rather than relying on an
  // unhandled throw to implicitly produce a 500, so that intent is
  // visible in the code.
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await confirmDepositPayment(paymentIntent.id);
        break;
      }
      case "payment_intent.payment_failed":
        // No failure-handling UI yet (CLAUDE.md 7.1 scope) -- logged so
        // a failed deposit isn't silently invisible, revisited when
        // that surface gets built.
        console.error("Deposit PaymentIntent failed:", event.data.object.id);
        break;
      case "refund.updated": {
        const refund = event.data.object;
        // Only a completed refund actually moved money -- a refund
        // can be created in "pending" status (e.g. some bank-transfer
        // methods) before later settling, so only "succeeded" is the
        // authoritative confirmation confirmDepositRefund needs.
        if (refund.status === "succeeded" && typeof refund.payment_intent === "string") {
          await confirmDepositRefund(refund.payment_intent, refund.id);
        }
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
