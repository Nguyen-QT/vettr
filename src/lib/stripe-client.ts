import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Browser-side Stripe.js loader (CLAUDE.md 7.1.6) -- separate from
// src/lib/stripe.ts's server-side secret-key client, which must never
// reach the browser. Cached as a module-level promise so Stripe.js is
// only ever loaded once, same intent as Stripe's own recommended
// pattern for React apps.
let stripePromise: Promise<Stripe | null> | undefined;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
    );
  }
  return stripePromise;
}
