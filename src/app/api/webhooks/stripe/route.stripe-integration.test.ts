import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import { POST } from "./route";

// Integration Test -- Webhook Signature Verification (CLAUDE.md 14.1.4):
// this route handler has no unit test at any tier today -- its own
// signature check (`stripe.webhooks.constructEvent`) can't be exercised
// meaningfully behind a mock, since a mocked Stripe client would just
// echo back whatever event object a test hands it, proving nothing
// about whether a real signature is actually verified. This file signs
// payloads with the real `stripe.webhooks.generateTestHeaderString` --
// genuine HMAC signing/verification, no network call -- and drives the
// exported `POST` handler directly with a constructed `NextRequest`,
// the same way Stripe's own servers would call this endpoint.
// Refund dispatch branches are unit-tested in route.test.ts; the one
// dispatch case here is the refund backstop's delivery proof
// (56.1.3.1), which replays an event Stripe really emitted rather than
// a hand-built payload.
describe("Stripe webhook route -- signature verification (real Stripe test mode)", () => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET must be set to run this test");
  }

  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Stripe Webhook Integration Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        handle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  function buildRequest(payload: string, signatureHeader: string | null) {
    const headers = new Headers();
    if (signatureHeader !== null) {
      headers.set("stripe-signature", signatureHeader);
    }
    return new NextRequest("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers,
      body: payload,
    });
  }

  it("accepts a genuinely signed payload and reconciles depositPaid", async () => {
    const paymentIntentId = `pi_webhook_test_${artistId}`;
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        stripePaymentIntentId: paymentIntentId,
      },
    });

    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: paymentIntentId } },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });

    const response = await POST(buildRequest(payload, signature));

    expect(response.status).toBe(200);
    const updated = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    expect(updated?.depositPaid).toBe(true);
  });

  it("rejects a tampered payload whose signature no longer matches", async () => {
    const paymentIntentId = `pi_webhook_tamper_${artistId}`;
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        stripePaymentIntentId: paymentIntentId,
      },
    });

    const originalPayload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: paymentIntentId } },
    });
    // Signs the original payload, then sends a different body -- the
    // exact shape of a man-in-the-middle tampering attempt, which a
    // real HMAC signature check must reject.
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: originalPayload,
      secret: webhookSecret,
    });
    const tamperedPayload = originalPayload.replace(paymentIntentId, "pi_attacker_controlled");

    const response = await POST(buildRequest(tamperedPayload, signature));

    expect(response.status).toBe(400);
    const untouched = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    expect(untouched?.depositPaid).toBe(false);
  });

  // Stripe makes an event readable through the Events API shortly after
  // the object change behind it, so poll briefly rather than assume it's
  // already there. Bounded by Stripe's own `created` clock (the refund's),
  // never the local one, so clock skew can't hide the event.
  async function waitForRefundCreatedEvent(refundId: string, refundCreated: number) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const events = await stripe.events.list({
        type: "refund.created",
        created: { gte: refundCreated },
        limit: 100,
      });
      const match = events.data.find(
        (event) => event.type === "refund.created" && event.data.object.id === refundId
      );
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`refund.created for ${refundId} never appeared`);
  }

  it(
    "reconciles a real refund.created event for a refund whose local write never happened",
    async () => {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: 2000,
        currency: "gbp",
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      });
      const request = await prisma.bookingRequest.create({
        data: {
          clientId,
          artistId,
          tier: "TIER_2",
          minPrice: 100,
          maxPrice: 200,
          status: "CANCELLED_BY_CLIENT",
          stripePaymentIntentId: paymentIntent.id,
          depositPaid: true,
        },
      });

      // Issued straight through Stripe rather than refundDeposit, so no
      // local write ever records it -- the exact state the backstop
      // exists for: Stripe refunded, depositRefunded still false.
      const refund = await stripe.refunds.create({ payment_intent: paymentIntent.id });
      const event = await waitForRefundCreatedEvent(refund.id, refund.created);

      const payload = JSON.stringify(event);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret,
      });

      const response = await POST(buildRequest(payload, signature));

      expect(response.status).toBe(200);
      const updated = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
      expect(updated?.depositRefunded).toBe(true);
      expect(updated?.stripeRefundId).toBe(refund.id);
    },
    30_000
  );

  it("rejects a request with no signature header at all", async () => {
    const payload = JSON.stringify({
      id: `evt_${randomUUID()}`,
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: `pi_no_sig_${artistId}` } },
    });

    const response = await POST(buildRequest(payload, null));

    expect(response.status).toBe(400);
  });
});
