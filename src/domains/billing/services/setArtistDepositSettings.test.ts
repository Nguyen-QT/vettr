import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { setArtistDepositSettings } from "./setArtistDepositSettings";

// Mocked-Prisma unit test (architecture.md §7). "No duplicate row" is the
// (artistId, tier) unique key's job in Postgres -- a 28.3 integration-tier
// candidate, not faked here; we assert the upsert is keyed on it.
describe("setArtistDepositSettings", () => {
  const artistId = "artist-1";

  it("upserts keyed on artist + tier, creating when none exists", async () => {
    prismaMock.artistDepositSetting.upsert.mockResolvedValue({} as never);

    await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 20 });

    expect(prismaMock.artistDepositSetting.upsert).toHaveBeenCalledWith({
      where: { artistId_tier: { artistId, tier: "TIER_2" } },
      update: { depositAmount: 20 },
      create: { artistId, tier: "TIER_2", depositAmount: 20 },
    });
  });

  it("uses the same key on a repeat call so the existing row is updated, not duplicated", async () => {
    prismaMock.artistDepositSetting.upsert.mockResolvedValue({} as never);

    await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 30 });
    await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 45 });

    expect(prismaMock.artistDepositSetting.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.artistDepositSetting.upsert).toHaveBeenLastCalledWith({
      where: { artistId_tier: { artistId, tier: "TIER_3" } },
      update: { depositAmount: 45 },
      create: { artistId, tier: "TIER_3", depositAmount: 45 },
    });
  });

  it("only targets the given tier, leaving other tiers untouched", async () => {
    prismaMock.artistDepositSetting.upsert.mockResolvedValue({} as never);

    await setArtistDepositSettings({ artistId, tier: "TIER_4", depositAmount: 40 });

    expect(prismaMock.artistDepositSetting.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistDepositSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId_tier: { artistId, tier: "TIER_4" } },
      })
    );
  });
});
