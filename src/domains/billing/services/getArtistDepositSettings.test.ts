import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getArtistDepositSettings } from "./getArtistDepositSettings";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("getArtistDepositSettings", () => {
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

  it("returns every tier as a key with null when nothing is configured", async () => {
    const result = await getArtistDepositSettings(artistId);

    expect(result).toEqual({
      TIER_2: null,
      TIER_3: null,
      TIER_4: null,
      FREESTYLE: null,
    });
  });

  it("returns the configured amount only for tiers that have one", async () => {
    await prisma.artistDepositSetting.createMany({
      data: [
        { artistId, tier: "TIER_2", depositAmount: 20 },
        { artistId, tier: "FREESTYLE", depositAmount: 75 },
      ],
    });

    const result = await getArtistDepositSettings(artistId);

    expect(result.TIER_2).toBe(20);
    expect(result.FREESTYLE).toBe(75);
    expect(result.TIER_3).toBeNull();
    expect(result.TIER_4).toBeNull();
  });

  it("does not let another artist's settings show up", async () => {
    const otherArtistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: otherArtistId,
        name: "Other Artist",
        instagramHandle: `test_artist_${otherArtistId.slice(0, 8)}`,
        email: `${otherArtistId}@example.com`,
      },
    });
    await prisma.artistDepositSetting.create({
      data: { artistId: otherArtistId, tier: "TIER_2", depositAmount: 50 },
    });

    const result = await getArtistDepositSettings(artistId);

    expect(result.TIER_2).toBeNull();

    await prisma.artistDepositSetting.deleteMany({
      where: { artistId: otherArtistId },
    });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });
});
