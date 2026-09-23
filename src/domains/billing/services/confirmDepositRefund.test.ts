import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { confirmDepositRefund } from "./confirmDepositRefund";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("confirmDepositRefund", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Confirm Refund Test Artist",
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
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(overrides: {
    depositPaid?: boolean;
    depositRefunded?: boolean;
    stripePaymentIntentId?: string | null;
  }) {
    return prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "CANCELLED_BY_CLIENT",
        depositPaid: overrides.depositPaid ?? true,
        depositRefunded: overrides.depositRefunded ?? false,
        stripePaymentIntentId: overrides.stripePaymentIntentId,
      },
    });
  }

  // PaymentIntent ids are namespaced with this test's own artistId
  // (unique per test via randomUUID in beforeEach) rather than bare
  // literals -- getBookingRequestByPaymentIntentId uses findFirst
  // against the whole shared table, so a bare "pi_123" reused across
  // test files running in parallel can otherwise match another file's
  // concurrently-live row (confirmDepositPayment.test.ts uses the same
  // literal pattern).
  it("flips depositRefunded to true and records the refund id for the matching request", async () => {
    const paymentIntentId = `pi_123_${artistId}`;
    const request = await createRequest({ stripePaymentIntentId: paymentIntentId });

    const result = await confirmDepositRefund(paymentIntentId, "re_123");

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(updated?.depositRefunded).toBe(true);
    expect(updated?.stripeRefundId).toBe("re_123");
  });

  it("is idempotent when called again for an already-confirmed refund", async () => {
    const paymentIntentId = `pi_456_${artistId}`;
    await createRequest({
      stripePaymentIntentId: paymentIntentId,
      depositRefunded: true,
    });

    const result = await confirmDepositRefund(paymentIntentId, "re_456");

    expect(result).toEqual({ success: true });
  });

  it("rejects a PaymentIntent id that matches no request", async () => {
    const result = await confirmDepositRefund(`pi_unknown_${artistId}`, "re_unknown");

    expect(result.success).toBe(false);
  });

  it("does not flip depositRefunded for a different request's PaymentIntent id", async () => {
    const request = await createRequest({
      stripePaymentIntentId: `pi_789_${artistId}`,
    });
    await createRequest({ stripePaymentIntentId: `pi_999_${artistId}` });

    await confirmDepositRefund(`pi_999_${artistId}`, "re_999");

    const untouched = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(untouched?.depositRefunded).toBe(false);
  });
});
