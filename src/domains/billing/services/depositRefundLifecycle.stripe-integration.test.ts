import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import { confirmDepositPayment } from "./confirmDepositPayment";
import { confirmDepositRefund } from "./confirmDepositRefund";
import { createDepositPaymentIntent } from "./createDepositPaymentIntent";
import { refundDeposit } from "./refundDeposit";

// Integration Test -- Refund Lifecycle (CLAUDE.md 14.1.3): mirrors
// 14.1.2's reasoning -- the mocked unit suites for refundDeposit/
// confirmDepositRefund already cover every business-logic branch
// (idempotency, not-paid, missing PaymentIntent) against a stubbed
// Stripe client. This file's only job is proving refundDeposit's real,
// unmocked `stripe.refunds.create` call still round-trips correctly
// against a real, paid test-mode PaymentIntent, and that
// confirmDepositRefund correctly no-ops on a real webhook redelivery
// of a refund it already knows about.
describe("deposit refund lifecycle (real Stripe test mode)", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Stripe Refund Integration Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
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

  it("refunds a real paid deposit and reconciles a webhook redelivery via confirmDepositRefund", async () => {
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

    // Same create -> confirm-with-test-card -> reconcile path as
    // 14.1.2, to reach a real, genuinely paid deposit -- refundDeposit
    // requires depositPaid to already be true.
    const createResult = await createDepositPaymentIntent({
      bookingRequestId: request.id,
      clientProfileId: clientId,
    });
    expect(createResult.success).toBe(true);

    const afterCreate = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    const paymentIntentId = afterCreate?.stripePaymentIntentId;
    if (!paymentIntentId) throw new Error("expected a stripePaymentIntentId");

    await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: "pm_card_visa",
    });
    await confirmDepositPayment(paymentIntentId);

    const refundResult = await refundDeposit(request.id);
    expect(refundResult).toEqual({ success: true });

    const afterRefund = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(afterRefund?.depositRefunded).toBe(true);
    expect(afterRefund?.stripeRefundId).toMatch(/^re_/);

    // Verifies the real refund is genuinely reflected on Stripe's side,
    // not just assumed from a successful `create` response.
    const refund = await stripe.refunds.retrieve(afterRefund!.stripeRefundId!);
    expect(refund.payment_intent).toBe(paymentIntentId);

    // Stands in for the `refund.updated` webhook redelivering the same
    // event after refundDeposit's own write already succeeded -- the
    // common case confirmDepositRefund exists to no-op on.
    const redeliveryResult = await confirmDepositRefund(
      paymentIntentId,
      afterRefund!.stripeRefundId!
    );
    expect(redeliveryResult).toEqual({ success: true });
  });
});
