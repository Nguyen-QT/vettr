import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import type { RequestStatus } from "@/domains/booking/types";

import { addBillingAddon } from "./addBillingAddon";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("addBillingAddon", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Checkout Addon Test Artist",
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

  async function createRequest(status: RequestStatus) {
    return prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
        estimatedPrice: 150,
      },
    });
  }

  it("adds an addon to an APPROVED request owned by the artist", async () => {
    const request = await createRequest("APPROVED");

    const result = await addBillingAddon({
      bookingRequestId: request.id,
      artistId,
      label: "Extra shading",
      price: 25,
    });

    expect(result).toEqual({ success: true });

    const addons = await prisma.addon.findMany({
      where: { bookingRequestId: request.id },
    });
    expect(addons).toHaveLength(1);
    expect(addons[0]?.label).toBe("Extra shading");
    expect(Number(addons[0]?.price)).toBe(25);
  });

  it("rejects a request that does not belong to the artist", async () => {
    const request = await createRequest("APPROVED");

    const result = await addBillingAddon({
      bookingRequestId: request.id,
      artistId: randomUUID(),
      label: "Extra shading",
      price: 25,
    });

    expect(result.success).toBe(false);
    expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
  });

  it("rejects a request that is not APPROVED", async () => {
    const request = await createRequest("PENDING");

    const result = await addBillingAddon({
      bookingRequestId: request.id,
      artistId,
      label: "Extra shading",
      price: 25,
    });

    expect(result.success).toBe(false);
    expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
  });

  it("rejects a request that doesn't exist", async () => {
    const result = await addBillingAddon({
      bookingRequestId: randomUUID(),
      artistId,
      label: "Extra shading",
      price: 25,
    });

    expect(result.success).toBe(false);
  });
});
