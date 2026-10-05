import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getTierReferenceImages } from "./getTierReferenceImages";

// Mocked-Prisma unit test (architecture.md §7).
describe("getTierReferenceImages", () => {
  const artistId = "artist-1";

  it("returns every tier as a key with an empty array when nothing is configured", async () => {
    prismaMock.tierReferenceImage.findMany.mockResolvedValue([]);

    const result = await getTierReferenceImages(artistId);

    expect(result).toEqual({
      TIER_2: [],
      TIER_3: [],
      TIER_4: [],
      FREESTYLE: [],
    });
  });

  it("groups images under their own tier", async () => {
    prismaMock.tierReferenceImage.findMany.mockResolvedValue([
      { tier: "TIER_2", imageUrl: "https://utfs.io/f/tier2-a.jpg" },
      { tier: "TIER_2", imageUrl: "https://utfs.io/f/tier2-b.jpg" },
      { tier: "FREESTYLE", imageUrl: "https://utfs.io/f/freestyle-a.jpg" },
    ] as never);

    const result = await getTierReferenceImages(artistId);

    expect(result.TIER_2).toEqual([
      "https://utfs.io/f/tier2-a.jpg",
      "https://utfs.io/f/tier2-b.jpg",
    ]);
    expect(result.FREESTYLE).toEqual(["https://utfs.io/f/freestyle-a.jpg"]);
    expect(result.TIER_3).toEqual([]);
    expect(result.TIER_4).toEqual([]);
  });

  it("scopes the query to the artist, oldest first (other artists' images never show up)", async () => {
    prismaMock.tierReferenceImage.findMany.mockResolvedValue([]);

    await getTierReferenceImages(artistId);

    expect(prismaMock.tierReferenceImage.findMany).toHaveBeenCalledWith({
      where: { artistId },
      orderBy: { createdAt: "asc" },
    });
  });
});
