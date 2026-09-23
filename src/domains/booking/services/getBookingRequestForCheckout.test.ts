import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getBookingRequestForCheckout } from "./getBookingRequestForCheckout";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getBookingRequestForCheckout", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Checkout View Test Artist",
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
        estimatedPrice: 150,
        depositAmount: 20,
        depositPaid: true,
      },
    });

    const result = await getBookingRequestForCheckout(request.id);

    expect(result).toEqual({
      id: request.id,
      artistId,
      status: "APPROVED",
      estimatedPrice: 150,
      depositAmount: 20,
      depositPaid: true,
    });
  });

  it("returns null values for a request with no estimate or deposit yet", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });

    const result = await getBookingRequestForCheckout(request.id);

    expect(result).toEqual({
      id: request.id,
      artistId,
      status: "PENDING",
      estimatedPrice: null,
      depositAmount: null,
      depositPaid: false,
    });
  });

  it("returns null for a request that doesn't exist", async () => {
    const result = await getBookingRequestForCheckout(randomUUID());

    expect(result).toBeNull();
  });
});
