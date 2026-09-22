import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { confirmDepositPayment } from "@/domains/billing/services/confirmDepositPayment";
import { stripe } from "@/lib/stripe";

// Route Handler (CLAUDE.md 7.1.5): dumb delivery only -- verifies the
// Stripe signature and delegates to confirmDepositPayment for the
// actual business logic. Reads the raw request body rather than
// request.json() since Stripe's signature is computed over the exact
// bytes it sent; a re-serialized JSON body would fail verification.
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

  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object;
      await confirmDepositPayment(paymentIntent.id);
      break;
    }
    case "payment_intent.payment_failed":
      // No failure-handling UI yet (CLAUDE.md 7.1 scope) -- logged so a
      // failed deposit isn't silently invisible, revisited when that
      // surface gets built.
      console.error("Deposit PaymentIntent failed:", event.data.object.id);
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
