import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getArtistDepositSettings } from "./getArtistDepositSettings";

// Mocked-Prisma unit test (architecture.md §7). Per-artist row isolation is
// the where clause's job; we assert it is scoped by artistId.
describe("getArtistDepositSettings", () => {
  const artistId = "artist-1";

  it("returns every tier as a key with null when nothing is configured", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([]);

    const result = await getArtistDepositSettings(artistId);

    expect(result).toEqual({
      TIER_2: null,
      TIER_3: null,
      TIER_4: null,
      FREESTYLE: null,
    });
  });

  it("returns the configured amount only for tiers that have one", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([
      { artistId, tier: "TIER_2", depositAmount: 20 },
      { artistId, tier: "FREESTYLE", depositAmount: "75.00" },
    ] as never);

    const result = await getArtistDepositSettings(artistId);

    expect(result.TIER_2).toBe(20);
    expect(result.FREESTYLE).toBe(75);
    expect(result.TIER_3).toBeNull();
    expect(result.TIER_4).toBeNull();
  });

  it("scopes the query to the requested artist so another artist's settings can't show up", async () => {
    prismaMock.artistDepositSetting.findMany.mockResolvedValue([]);

    await getArtistDepositSettings(artistId);

    expect(prismaMock.artistDepositSetting.findMany).toHaveBeenCalledWith({
      where: { artistId },
    });
  });
});
