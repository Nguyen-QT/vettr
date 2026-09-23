import { describe, expect, it } from "vitest";

import { stripe } from "./stripe";

// Harness smoke test (CLAUDE.md 14.1.1): proves vitest.stripe.config.mts
// actually discovers *.stripe-integration.test.ts and reaches Stripe's
// real test-mode API with no mocking -- balance.retrieve is a free,
// read-only call that needs nothing set up on the account beyond a
// valid secret key, so it fails loudly if STRIPE_SECRET_KEY is missing,
// a live-mode key, or otherwise invalid. The actual domain-service
// integration coverage (PaymentIntent/refund lifecycles, webhook
// signature verification) lands in 14.1.2-14.1.4, not here.
describe("Stripe test-mode harness", () => {
  it("reaches the real Stripe test-mode API with the configured secret key", async () => {
    const balance = await stripe.balance.retrieve();

    expect(balance.livemode).toBe(false);
  });
});
