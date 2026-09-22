import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { confirmDepositPayment } from "./confirmDepositPayment";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("confirmDepositPayment", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Confirm Deposit Test Artist",
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
    stripePaymentIntentId?: string | null;
  }) {
    return prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        depositPaid: overrides.depositPaid ?? false,
        stripePaymentIntentId: overrides.stripePaymentIntentId,
      },
    });
  }

  it("flips depositPaid to true for the matching request", async () => {
    const request = await createRequest({ stripePaymentIntentId: "pi_123" });

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(updated?.depositPaid).toBe(true);
  });

  it("is idempotent when called again for an already-confirmed request", async () => {
    await createRequest({ stripePaymentIntentId: "pi_456", depositPaid: true });

    const result = await confirmDepositPayment("pi_456");

    expect(result).toEqual({ success: true });
  });

  it("rejects a PaymentIntent id that matches no request", async () => {
    const result = await confirmDepositPayment("pi_unknown");

    expect(result.success).toBe(false);
  });

  it("does not flip depositPaid for a different request's PaymentIntent id", async () => {
    const request = await createRequest({ stripePaymentIntentId: "pi_789" });
    await createRequest({ stripePaymentIntentId: "pi_999" });

    await confirmDepositPayment("pi_999");

    const untouched = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(untouched?.depositPaid).toBe(false);
  });
});
