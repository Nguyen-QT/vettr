import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

import { confirmDepositPayment } from "./confirmDepositPayment";
import { createDepositPaymentIntent } from "./createDepositPaymentIntent";
import { refundDeposit } from "./refundDeposit";
import { syncDepositRefundStatus } from "./syncDepositRefundStatus";

// Integration Test -- Refund Lifecycle (CLAUDE.md 14.1.3): mirrors
// 14.1.2's reasoning -- the mocked unit suites for refundDeposit/
// syncDepositRefundStatus already cover every business-logic branch
// (idempotency, not-paid, missing PaymentIntent) against a stubbed
// Stripe client. This file's only job is proving refundDeposit's real,
// unmocked `stripe.refunds.create` call still round-trips correctly
// against a real, paid test-mode PaymentIntent, and that
// syncDepositRefundStatus correctly no-ops on a real webhook redelivery
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

  it("refunds a real paid deposit and no-ops on a webhook redelivery via syncDepositRefundStatus", async () => {
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

    // Billing's refund row (56.6): the intent recorded before the call,
    // moved to the status Stripe's real response reported. An immediate
    // card refund is created already succeeded (56.1).
    const readRefundRow = () =>
      prisma.depositRefund.findUnique({
        where: { bookingRequestId: request.id },
        select: { status: true, stripePaymentIntentId: true, stripeRefundId: true },
      });
    const refundRow = await readRefundRow();
    expect(refundRow).toEqual({
      status: "SUCCEEDED",
      stripePaymentIntentId: paymentIntentId,
      stripeRefundId: expect.stringMatching(/^re_/),
    });

    // Verifies the real refund is genuinely reflected on Stripe's side,
    // not just assumed from a successful `create` response.
    const refund = await stripe.refunds.retrieve(refundRow!.stripeRefundId!);
    expect(refund.payment_intent).toBe(paymentIntentId);
    expect(refund.metadata?.bookingRequestId).toBe(request.id);

    // Stands in for the webhook's refund.created (and the
    // refund.updated that follows once the card's ARN arrives, 56.1)
    // reaching syncDepositRefundStatus after refundDeposit's own write
    // already succeeded, mapped the way the route maps it. The row
    // already holds this refund at this status, so nothing is written.
    // Real delivery through the route is proven in
    // route.stripe-integration.test.ts.
    const written = await syncDepositRefundStatus({
      stripeRefundId: refund.id,
      stripePaymentIntentId:
        typeof refund.payment_intent === "string" ? refund.payment_intent : null,
      metadataBookingRequestId: refund.metadata?.bookingRequestId,
      stripeStatus: refund.status,
      failureReason: refund.failure_reason,
    });
    expect(written).toBe(false);
    expect(await readRefundRow()).toEqual(refundRow);
  });
});
