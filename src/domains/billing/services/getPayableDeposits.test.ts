import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ApprovedUnpaidRequestSummary } from "@/domains/booking/types";
import { prisma } from "@/lib/prisma";

import { getPayableDeposits } from "./getPayableDeposits";

// Hits the real local Postgres database for ArtistDepositSetting only
// -- getPayableDeposits is a pure join over its input, so no
// ClientProfile/BookingRequest fixtures are needed here (see booking's
// getApprovedUnpaidRequestSummaries.test.ts for that side).
describe("getPayableDeposits", () => {
  let artistId: string;
  let otherArtistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    otherArtistId = randomUUID();

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
    await prisma.artistDepositSetting.deleteMany({
      where: { artistId: { in: [artistId, otherArtistId] } },
    });
    await prisma.artist.delete({ where: { id: artistId } });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });

  function summary(
    overrides: Partial<ApprovedUnpaidRequestSummary> = {}
  ): ApprovedUnpaidRequestSummary {
    return {
      id: randomUUID(),
      artistId,
      tier: "TIER_2",
      ...overrides,
    };
  }

  it("includes a request whose tier has a configured deposit", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    const request = summary();

    const result = await getPayableDeposits([request]);

    expect(result).toEqual({ [request.id]: 25 });
  });

  it("excludes a request whose tier has no configured deposit", async () => {
    const request = summary();

    const result = await getPayableDeposits([request]);

    expect(result[request.id]).toBeUndefined();
  });

  it("resolves each request's amount against its own artist's tier settings", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    await prisma.artistDepositSetting.create({
      data: { artistId: otherArtistId, tier: "TIER_2", depositAmount: 60 },
    });
    const requestA = summary({ artistId });
    const requestB = summary({ artistId: otherArtistId });

    const result = await getPayableDeposits([requestA, requestB]);

    expect(result).toEqual({ [requestA.id]: 25, [requestB.id]: 60 });
  });

  it("does not cross-match a tier against the wrong artist's setting", async () => {
    await prisma.artistDepositSetting.create({
      data: { artistId, tier: "TIER_2", depositAmount: 25 },
    });
    const request = summary({ artistId: otherArtistId, tier: "TIER_2" });

    const result = await getPayableDeposits([request]);

    expect(result[request.id]).toBeUndefined();
  });

  it("returns an empty object for an empty input", async () => {
    const result = await getPayableDeposits([]);

    expect(result).toEqual({});
  });
});
