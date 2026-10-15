import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { syncArtistConnectAccountStatus } from "@/domains/billing/services/syncArtistConnectAccountStatus";
import { stripe } from "@/lib/stripe";

// Route Handler (53.2.3.1): the Connected-accounts webhook endpoint.
// Stripe sends a connected account's account.updated only to an endpoint
// whose "Events from" is "Connected accounts", and that endpoint has its
// own signing secret, so it can't share /api/webhooks/stripe and its
// STRIPE_WEBHOOK_SECRET. Same dumb-delivery shape as that route: verify
// the signature over the raw body, then delegate. The endpoint only needs
// to subscribe to account.updated; anything else answers 200 so Stripe
// doesn't count it as a failed delivery. Out-of-order account.updated
// events are not handled here (56.9).
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

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

  if (event.type === "account.updated") {
    const account = event.data.object;
    // A non-2xx response makes Stripe retry delivery, the safety net for
    // a transient DB error. syncArtistConnectAccountStatus overwrites
    // both flags with the event's values, so a retry is safe.
    try {
      await syncArtistConnectAccountStatus(
        account.id,
        account.charges_enabled,
        account.payouts_enabled
      );
    } catch (error) {
      console.error("Stripe Connect webhook handler failed:", event.type, error);
      return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
