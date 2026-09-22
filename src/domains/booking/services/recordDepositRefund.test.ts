import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { recordDepositRefund } from "./recordDepositRefund";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("recordDepositRefund", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Record Refund Test Artist",
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

  it("flips depositRefunded to true and persists the Stripe refund id", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "CANCELLED_BY_CLIENT",
        depositPaid: true,
        stripePaymentIntentId: "pi_refund_123",
      },
    });

    await recordDepositRefund(request.id, "re_refund_123");

    const updated = await prisma.bookingRequest.findUnique({
      where: { id: request.id },
    });
    expect(updated?.depositRefunded).toBe(true);
    expect(updated?.stripeRefundId).toBe("re_refund_123");
  });
});
