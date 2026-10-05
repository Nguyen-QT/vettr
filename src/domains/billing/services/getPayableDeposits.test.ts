import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import type { ApprovedUnpaidRequestSummary } from "@/domains/booking/types";

import { getPayableDeposits } from "./getPayableDeposits";

// Mocked-Prisma unit test (architecture.md §7): getPayableDeposits is a
// pure join over its input plus one batched ArtistDepositSetting read.
describe("getPayableDeposits", () => {
  const artistId = "artist-1";
  const otherArtistId = "artist-2";

  function summary(
    id: string,
    overrides: Partial<ApprovedUnpaidRequestSummary> = {}
  ): ApprovedUnpaidRequestSummary {
    return { id, artistId, tier: "TIER_2", ...overrides };
  }

  it("includes a request whose tier has a configured deposit", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([
      { artistId, tier: "TIER_2", depositAmount: 25 },
    ] as never);

    const result = await getPayableDeposits([summary("r1")]);

    expect(result).toEqual({ r1: 25 });
    expect(prismaMock.artistDepositSetting.findMany).toHaveBeenCalledWith({
      where: { artistId: { in: [artistId] } },
    });
  });

  it("excludes a request whose tier has no configured deposit", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([]);

    const result = await getPayableDeposits([summary("r1")]);

    expect(result.r1).toBeUndefined();
  });

  it("resolves each request's amount against its own artist's tier settings in one batched query", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([
      { artistId, tier: "TIER_2", depositAmount: 25 },
      { artistId: otherArtistId, tier: "TIER_2", depositAmount: "60.00" },
    ] as never);

    const result = await getPayableDeposits([
      summary("r1", { artistId }),
      summary("r2", { artistId: otherArtistId }),
      summary("r3", { artistId }),
    ]);

    expect(result).toEqual({ r1: 25, r2: 60, r3: 25 });
    expect(prismaMock.artistDepositSetting.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistDepositSetting.findMany).toHaveBeenCalledWith({
      where: { artistId: { in: [artistId, otherArtistId] } },
    });
  });

  it("does not cross-match a tier against the wrong artist's setting", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([
      { artistId, tier: "TIER_2", depositAmount: 25 },
    ] as never);

    const result = await getPayableDeposits([
      summary("r1", { artistId: otherArtistId, tier: "TIER_2" }),
    ]);

    expect(result.r1).toBeUndefined();
  });

  it("returns an empty object for an empty input without querying", async () => {
    const result = await getPayableDeposits([]);

    expect(result).toEqual({});
    expect(prismaMock.artistDepositSetting.findMany).not.toHaveBeenCalled();
  });
});
