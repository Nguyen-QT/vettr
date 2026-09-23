import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getFinalBillTotal } from "./getFinalBillTotal";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("getFinalBillTotal", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Final Bill Test Artist",
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

  it("totals the estimate plus addons when no deposit was paid", async () => {
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
    await prisma.addon.create({
      data: { bookingRequestId: request.id, label: "Extra shading", price: 25 },
    });
    await prisma.addon.create({
      data: { bookingRequestId: request.id, label: "Touch-up", price: 10 },
    });

    const result = await getFinalBillTotal(request.id, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 35, depositCredit: 0, total: 185 },
    });
  });

  it("credits a paid deposit against the total", async () => {
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

    const result = await getFinalBillTotal(request.id, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 0, depositCredit: 20, total: 130 },
    });
  });

  it("does not credit a configured deposit amount that was never actually paid", async () => {
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
        depositPaid: false,
      },
    });

    const result = await getFinalBillTotal(request.id, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 0, depositCredit: 0, total: 150 },
    });
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
        estimatedPrice: 150,
      },
    });

    const result = await getFinalBillTotal(request.id, randomUUID());

    expect(result.success).toBe(false);
  });

  it("rejects a request that doesn't exist", async () => {
    const result = await getFinalBillTotal(randomUUID(), artistId);

    expect(result.success).toBe(false);
  });
});
