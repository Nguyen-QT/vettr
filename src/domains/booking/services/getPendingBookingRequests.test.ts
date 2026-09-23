import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getPendingBookingRequests } from "./getPendingBookingRequests";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getPendingBookingRequests", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Pending Requests Test Artist",
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

  it("surfaces a client's cancellation count and precharge flag", async () => {
    await prisma.clientProfile.update({
      where: { id: clientId },
      data: { cancellationCount: 2, enforcePrecharge: true },
    });
    await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.clientCancellationCount).toBe(2);
    expect(result?.clientEnforcePrecharge).toBe(true);
  });

  it("defaults to zero/false for a client with no cancellation history", async () => {
    await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "PENDING",
      },
    });

    const [result] = await getPendingBookingRequests(artistId);

    expect(result?.clientCancellationCount).toBe(0);
    expect(result?.clientEnforcePrecharge).toBe(false);
  });
});
