import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { setArtistDepositSettings } from "./setArtistDepositSettings";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("setArtistDepositSettings", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Deposit Settings Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artistDepositSetting.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a row when none exists for that tier", async () => {
    await setArtistDepositSettings({ artistId, tier: "TIER_2", depositAmount: 20 });

    const row = await prisma.artistDepositSetting.findUnique({
      where: { artistId_tier: { artistId, tier: "TIER_2" } },
    });
    expect(Number(row?.depositAmount)).toBe(20);
  });

  it("updates the existing row instead of creating a duplicate", async () => {
    await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 30 });
    await setArtistDepositSettings({ artistId, tier: "TIER_3", depositAmount: 45 });

    const rows = await prisma.artistDepositSetting.findMany({
      where: { artistId, tier: "TIER_3" },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].depositAmount)).toBe(45);
  });

  it("does not affect a different tier for the same artist", async () => {
    await setArtistDepositSettings({ artistId, tier: "TIER_4", depositAmount: 40 });

    const otherTier = await prisma.artistDepositSetting.findUnique({
      where: { artistId_tier: { artistId, tier: "FREESTYLE" } },
    });
    expect(otherTier).toBeNull();
  });
});
