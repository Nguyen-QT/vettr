import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getBookingRequestForDeposit } from "./getBookingRequestForDeposit";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getBookingRequestForDeposit", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Deposit View Test Artist",
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

  it("returns the narrow view for an existing request", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        depositPaid: true,
        stripePaymentIntentId: "pi_view_123",
        depositRefunded: false,
      },
    });

    const result = await getBookingRequestForDeposit(request.id);

    expect(result).toEqual({
      id: request.id,
      clientId,
      artistId,
      tier: "TIER_2",
      status: "APPROVED",
      depositPaid: true,
      stripePaymentIntentId: "pi_view_123",
      depositRefunded: false,
    });
  });

  it("returns null for a request that doesn't exist", async () => {
    const result = await getBookingRequestForDeposit(randomUUID());

    expect(result).toBeNull();
  });
});
