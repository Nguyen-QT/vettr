import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import type { RequestStatus } from "@/domains/booking/types";

import { removeBillingAddon } from "./removeBillingAddon";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("removeBillingAddon", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Checkout Addon Removal Test Artist",
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

  async function createRequestWithAddon(status: RequestStatus) {
    const request = await prisma.bookingRequest.create({
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
    const addon = await prisma.addon.create({
      data: { bookingRequestId: request.id, label: "Extra shading", price: 25 },
    });
    return { request, addon };
  }

  it("removes an addon from an APPROVED request owned by the artist", async () => {
    const { request, addon } = await createRequestWithAddon("APPROVED");

    const result = await removeBillingAddon({ addonId: addon.id, artistId });

    expect(result).toEqual({ success: true });
    expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
  });

  it("rejects removal for an addon on a request that does not belong to the artist", async () => {
    const { addon } = await createRequestWithAddon("APPROVED");

    const result = await removeBillingAddon({
      addonId: addon.id,
      artistId: randomUUID(),
    });

    expect(result.success).toBe(false);
    expect(await prisma.addon.findUnique({ where: { id: addon.id } })).not.toBeNull();
  });

  it("rejects removal when the request is not APPROVED", async () => {
    const { addon } = await createRequestWithAddon("PENDING");

    const result = await removeBillingAddon({ addonId: addon.id, artistId });

    expect(result.success).toBe(false);
    expect(await prisma.addon.findUnique({ where: { id: addon.id } })).not.toBeNull();
  });

  it("rejects removal of an addon that doesn't exist", async () => {
    const result = await removeBillingAddon({ addonId: randomUUID(), artistId });

    expect(result.success).toBe(false);
  });
});
