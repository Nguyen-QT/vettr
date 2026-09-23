import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getBillingAddons } from "./getBillingAddons";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("getBillingAddons", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Checkout Addon List Test Artist",
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

  it("lists a request's addons in creation order", async () => {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
        estimatedPrice: 150,
      },
    });
    const first = await prisma.addon.create({
      data: { bookingRequestId: request.id, label: "Extra shading", price: 25 },
    });
    const second = await prisma.addon.create({
      data: { bookingRequestId: request.id, label: "Touch-up", price: 10 },
    });

    const result = await getBillingAddons(request.id, artistId);

    expect(result).toEqual({
      success: true,
      addons: [
        { id: first.id, label: "Extra shading", price: 25 },
        { id: second.id, label: "Touch-up", price: 10 },
      ],
    });
  });

  it("returns an empty list for a request with no addons", async () => {
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

    const result = await getBillingAddons(request.id, artistId);

    expect(result).toEqual({ success: true, addons: [] });
  });

  it("rejects a request that does not belong to the artist", async () => {
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

    const result = await getBillingAddons(request.id, randomUUID());

    expect(result.success).toBe(false);
  });

  it("rejects a request that doesn't exist", async () => {
    const result = await getBillingAddons(randomUUID(), artistId);

    expect(result.success).toBe(false);
  });
});
