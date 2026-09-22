import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getPayableDeposits } from "./getPayableDeposits";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("getPayableDeposits", () => {
  let clientId: string;
  let artistId: string;
  let otherArtistId: string;

  beforeEach(async () => {
    clientId = randomUUID();
    artistId = randomUUID();
    otherArtistId = randomUUID();

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
        name: "Payable Deposits Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.artist.create({
      data: {
        id: otherArtistId,
        name: "Other Artist",
        instagramHandle: `test_artist_${otherArtistId.slice(0, 8)}`,
        email: `${otherArtistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.intakeRequest.deleteMany({ where: { clientId } });
    await prisma.artistDepositSetting.deleteMany({
      where: { artistId: { in: [artistId, otherArtistId] } },
    });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });

  async function createRequest(overrides: {
    artistId: string;
    status: "PENDING" | "APPROVED";
    tier?: "TIER_2" | "TIER_3" | "TIER_4" | "FREESTYLE";
    depositPaid?: boolean;
  }) {
    return prisma.intakeRequest.create({
      data: {
        clientId,
        artistId: overrides.artistId,
        tier: overrides.tier ?? "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status: overrides.status,
        depositPaid: overrides.depositPaid ?? false,
      },
    });
  }

  it("includes an APPROVED, unpaid request whose tier has a configured deposit", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    const request = await createRequest({ artistId, status: "APPROVED" });

    const result = await getPayableDeposits(clientId);

    expect(result).toEqual({ [request.id]: 25 });
  });

  it("excludes a request whose tier has no configured deposit", async () => {
    const request = await createRequest({ artistId, status: "APPROVED" });

    const result = await getPayableDeposits(clientId);

    expect(result[request.id]).toBeUndefined();
  });

  it("excludes a request that is not APPROVED", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    const request = await createRequest({ artistId, status: "PENDING" });

    const result = await getPayableDeposits(clientId);

    expect(result[request.id]).toBeUndefined();
  });

  it("excludes a request whose deposit is already paid", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    const request = await createRequest({
      artistId,
      status: "APPROVED",
      depositPaid: true,
    });

    const result = await getPayableDeposits(clientId);

    expect(result[request.id]).toBeUndefined();
  });

  it("resolves each request's amount against its own artist's tier settings", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    await prisma.artistDepositSetting.create({
      data: { artistId: otherArtistId, tier: "TIER_2", depositAmount: 60 },
    });
    const requestA = await createRequest({ artistId, status: "APPROVED" });
    const requestB = await createRequest({ artistId: otherArtistId, status: "APPROVED" });

    const result = await getPayableDeposits(clientId);

    expect(result).toEqual({ [requestA.id]: 25, [requestB.id]: 60 });
  });

  it("returns an empty object for a client with no requests", async () => {
    const result = await getPayableDeposits(clientId);

    expect(result).toEqual({});
  });
});
