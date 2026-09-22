import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getTierReferenceImages } from "./getTierReferenceImages";

// Hits the real local Postgres database, same as the other booking
// service tests.
describe("getTierReferenceImages", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Tier Gallery Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.tierReferenceImage.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("returns every tier as a key with an empty array when nothing is configured", async () => {
    const result = await getTierReferenceImages(artistId);

    expect(result).toEqual({
      TIER_2: [],
      TIER_3: [],
      TIER_4: [],
      FREESTYLE: [],
    });
  });

  it("groups images under their own tier", async () => {
    await prisma.tierReferenceImage.createMany({
      data: [
        { artistId, tier: "TIER_2", imageUrl: "https://utfs.io/f/tier2-a.jpg" },
        { artistId, tier: "TIER_2", imageUrl: "https://utfs.io/f/tier2-b.jpg" },
        { artistId, tier: "FREESTYLE", imageUrl: "https://utfs.io/f/freestyle-a.jpg" },
      ],
    });

    const result = await getTierReferenceImages(artistId);

    expect(result.TIER_2).toEqual([
      "https://utfs.io/f/tier2-a.jpg",
      "https://utfs.io/f/tier2-b.jpg",
    ]);
    expect(result.FREESTYLE).toEqual(["https://utfs.io/f/freestyle-a.jpg"]);
    expect(result.TIER_3).toEqual([]);
    expect(result.TIER_4).toEqual([]);
  });

  it("does not let another artist's images show up", async () => {
    const otherArtistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: otherArtistId,
        name: "Other Artist",
        instagramHandle: `test_artist_${otherArtistId.slice(0, 8)}`,
        email: `${otherArtistId}@example.com`,
      },
    });
    await prisma.tierReferenceImage.create({
      data: {
        artistId: otherArtistId,
        tier: "TIER_2",
        imageUrl: "https://utfs.io/f/other-artist.jpg",
      },
    });

    const result = await getTierReferenceImages(artistId);

    expect(result.TIER_2).toEqual([]);

    await prisma.tierReferenceImage.deleteMany({ where: { artistId: otherArtistId } });
    await prisma.artist.delete({ where: { id: otherArtistId } });
  });
});
