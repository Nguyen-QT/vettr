import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getApprovedUnpaidRequestSummaries } from "./getApprovedUnpaidRequestSummaries";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getApprovedUnpaidRequestSummaries", () => {
  let clientId: string;
  let artistId: string;

  beforeEach(async () => {
    clientId = randomUUID();
    artistId = randomUUID();

    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Approved Unpaid Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { clientId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(overrides: {
    status: "PENDING" | "APPROVED";
    depositPaid?: boolean;
  }) {
    return prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: overrides.status,
        depositPaid: overrides.depositPaid ?? false,
      },
    });
  }

  it("includes an APPROVED, unpaid request", async () => {
    const request = await createRequest({ status: "APPROVED" });

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([{ id: request.id, artistId, tier: "TIER_2" }]);
  });

  it("excludes a request that is not APPROVED", async () => {
    await createRequest({ status: "PENDING" });

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([]);
  });

  it("excludes a request whose deposit is already paid", async () => {
    await createRequest({ status: "APPROVED", depositPaid: true });

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([]);
  });

  it("does not let another client's requests show up", async () => {
    const otherClientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: otherClientId,
        instagramHandle: `test_client_${otherClientId.slice(0, 8)}`,
        email: `test_client_${otherClientId.slice(0, 8)}@example.com`,
      },
    });
    await prisma.bookingRequest.create({
      data: {
        clientId: otherClientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: "APPROVED",
      },
    });

    const result = await getApprovedUnpaidRequestSummaries(clientId);

    expect(result).toEqual([]);

    await prisma.bookingRequest.deleteMany({ where: { clientId: otherClientId } });
    await prisma.clientProfile.delete({ where: { id: otherClientId } });
  });
});
