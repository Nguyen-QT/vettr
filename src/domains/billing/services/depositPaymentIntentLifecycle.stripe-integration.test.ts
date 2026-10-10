import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import { confirmDepositPayment } from "./confirmDepositPayment";
import { createDepositPaymentIntent } from "./createDepositPaymentIntent";

// Integration Test -- Payment Intent Lifecycle (CLAUDE.md 14.1.2): the
// mocked unit suites for createDepositPaymentIntent/confirmDepositPayment
// already cover every business-logic branch (ownership, status guards,
// precharge amount math, idempotency) against a stubbed Stripe client --
// that coverage isn't repeated here. This file's only job is proving the
// two functions' real, unmocked round trip against Stripe's actual
// test-mode API still holds: that `stripe.paymentIntents.create`'s real
// response shape matches what createDepositPaymentIntent expects, and
// that a PaymentIntent driven to a real `succeeded` status (via a test
// card confirmed server-side, standing in for the client-side Stripe.js
// confirmation this app normally relies on) is exactly what
// confirmDepositPayment's caller -- the `payment_intent.succeeded`
// webhook -- would hand it in production. It also proves 56.4's reuse
// and replace against real Stripe: that a retrieved PaymentIntent's shape
// matches what the reuse check compares, and that a replaced one really
// can't be paid.
describe("deposit PaymentIntent lifecycle (real Stripe test mode)", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Stripe Integration Test Artist",
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
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.artistDepositSetting.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a real PaymentIntent, confirms it with a test card, and reconciles depositPaid", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
      },
    });

    const createResult = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });

    expect(createResult.success).toBe(true);
    if (!createResult.success) return;
    expect(createResult.clientSecret).toMatch(/^pi_.+_secret_.+$/);

    const afterCreate = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    const paymentIntentId = afterCreate?.stripePaymentIntentId;
    expect(paymentIntentId).toMatch(/^pi_/);
    expect(Number(afterCreate?.depositAmount)).toBe(20);
    if (!paymentIntentId) return;

    // Stands in for the client's Stripe.js confirmation in the browser
    // -- Stripe's documented test payment method token for an
    // always-succeeds Visa card, usable directly from the server in
    // test mode.
    const confirmed = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: "pm_card_visa",
    });
    expect(confirmed.status).toBe("succeeded");

    const confirmResult = await confirmDepositPayment(paymentIntentId);
    expect(confirmResult).toEqual({ success: true });

    const afterConfirm = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(afterConfirm?.depositPaid).toBe(true);

    // Idempotency against a real, already-reconciled PaymentIntent --
    // the redelivery case Stripe's webhook retries actually produce.
    const secondConfirmResult = await confirmDepositPayment(paymentIntentId);
    expect(secondConfirmResult).toEqual({ success: true });
  });

  it("reuses an open PaymentIntent, and replaces it once the tier amount changes", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
      },
    });
    const input = { bookingRequestId: request.id, clientProfileId: clientId };

    const first = await createDepositPaymentIntent(input);
    expect(first.success).toBe(true);
    if (!first.success) return;
    const afterFirst = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    const firstPaymentIntentId = afterFirst?.stripePaymentIntentId;
    expect(firstPaymentIntentId).toMatch(/^pi_/);
    if (!firstPaymentIntentId) return;

    const second = await createDepositPaymentIntent(input);
    expect(second).toEqual({ success: true, clientSecret: first.clientSecret });
    const afterSecond = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    expect(afterSecond?.stripePaymentIntentId).toBe(firstPaymentIntentId);

    await prisma.artistDepositSetting.update({
      where: { artistId_tier: { artistId, tier: "TIER_2" } },
      data: { depositAmount: 30 },
    });

    const third = await createDepositPaymentIntent(input);
    expect(third.success).toBe(true);
    if (!third.success) return;
    expect(third.clientSecret).not.toBe(first.clientSecret);
    const afterThird = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    const replacementId = afterThird?.stripePaymentIntentId;
    expect(replacementId).toMatch(/^pi_/);
    expect(replacementId).not.toBe(firstPaymentIntentId);
    expect(Number(afterThird?.depositAmount)).toBe(30);
    if (!replacementId) return;

    const replacement = await stripe.paymentIntents.retrieve(replacementId);
    expect(replacement.amount).toBe(3000);

    const replaced = await stripe.paymentIntents.retrieve(firstPaymentIntentId);
    expect(replaced.status).toBe("canceled");
    await expect(
      stripe.paymentIntents.confirm(firstPaymentIntentId, { payment_method: "pm_card_visa" })
    ).rejects.toThrow();
  });
});
