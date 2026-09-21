import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getArtistDirectory } from "./getArtistDirectory";

// Hits the real local Postgres database, same as the other domain
// service tests.
describe("getArtistDirectory", () => {
  const artistIds: string[] = [];

  afterEach(async () => {
    await prisma.artist.deleteMany({ where: { id: { in: artistIds } } });
    artistIds.length = 0;
  });

  async function createArtist(overrides: {
    name: string;
    avatarUrl?: string;
    bio?: string;
    location?: string;
  }): Promise<string> {
    const artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: overrides.name,
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
        avatarUrl: overrides.avatarUrl,
        bio: overrides.bio,
        location: overrides.location,
      },
    });
    artistIds.push(artistId);
    return artistId;
  }

  it("returns an artist with directory fields populated", async () => {
    const artistId = await createArtist({
      name: "Directory Test Artist",
      avatarUrl: "https://utfs.io/f/e2e-fixture-avatar.jpg",
      bio: "Fine line and botanical work.",
      location: "London, UK",
    });

    const result = await getArtistDirectory();
    const entry = result.find((artist) => artist.id === artistId);

    expect(entry).toMatchObject({
      id: artistId,
      name: "Directory Test Artist",
      avatarUrl: "https://utfs.io/f/e2e-fixture-avatar.jpg",
      bio: "Fine line and botanical work.",
      location: "London, UK",
    });
  });

  it("includes an artist with no directory fields set, as nulls", async () => {
    const artistId = await createArtist({ name: "Bare Test Artist" });

    const result = await getArtistDirectory();
    const entry = result.find((artist) => artist.id === artistId);

    expect(entry).toMatchObject({
      avatarUrl: null,
      bio: null,
      location: null,
    });
  });

  it("orders artists by name ascending", async () => {
    const laterId = await createArtist({ name: "Zeta Studio" });
    const soonerId = await createArtist({ name: "Alpha Studio" });

    const result = await getArtistDirectory();
    const ids = result.map((artist) => artist.id);

    expect(ids.indexOf(soonerId)).toBeLessThan(ids.indexOf(laterId));
  });
});
