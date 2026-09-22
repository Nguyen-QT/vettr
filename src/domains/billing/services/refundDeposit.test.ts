import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import * as recordDepositRefundModule from "@/domains/booking/services/recordDepositRefund";

import { refundDeposit } from "./refundDeposit";

const createRefundMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before refundDeposit above
// ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: {
      create: (...args: unknown[]) => createRefundMock(...args),
    },
  },
}));

// Hits the real local Postgres database for everything except the
// Stripe API call itself, which is mocked above -- same split as
// createDepositPaymentIntent.test.ts.
describe("refundDeposit", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    createRefundMock.mockReset();
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Refund Deposit Test Artist",
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
        depositPaid: overrides.depositPaid ?? false,
        depositRefunded: overrides.depositRefunded ?? false,
        stripePaymentIntentId: overrides.stripePaymentIntentId,
      },
    });
  }

  it("issues a Stripe refund and records it when the deposit is paid and unrefunded", async () => {
    const request = await createRequest({
      depositPaid: true,
      stripePaymentIntentId: "pi_refund_123",
    });
    createRefundMock.mockResolvedValue({ id: "re_123" });

    const result = await refundDeposit(request.id);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledWith({
      payment_intent: "pi_refund_123",
    });

    const updated = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(updated?.depositRefunded).toBe(true);
    expect(updated?.stripeRefundId).toBe("re_123");
  });

  it("is idempotent when the deposit was already refunded", async () => {
    const request = await createRequest({
      depositPaid: true,
      depositRefunded: true,
      stripePaymentIntentId: "pi_refund_456",
    });

    const result = await refundDeposit(request.id);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("rejects a request whose deposit was never paid", async () => {
    const request = await createRequest({ depositPaid: false });

    const result = await refundDeposit(request.id);

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    const result = await refundDeposit(randomUUID());

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("returns a clean error when the Stripe refund call itself fails", async () => {
    const request = await createRequest({
      depositPaid: true,
      stripePaymentIntentId: "pi_refund_fail",
    });
    createRefundMock.mockRejectedValue(new Error("Stripe network error"));

    const result = await refundDeposit(request.id);

    expect(result.success).toBe(false);
    const untouched = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(untouched?.depositRefunded).toBe(false);
  });

  it("still reports success when Stripe succeeds but the local write fails -- the refund already happened", async () => {
    const request = await createRequest({
      depositPaid: true,
      stripePaymentIntentId: "pi_refund_write_fail",
    });
    createRefundMock.mockResolvedValue({ id: "re_write_fail" });
    const recordSpy = vi
      .spyOn(recordDepositRefundModule, "recordDepositRefund")
      .mockRejectedValueOnce(new Error("DB write failed"));

    const result = await refundDeposit(request.id);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledTimes(1);

    recordSpy.mockRestore();
  });
});
