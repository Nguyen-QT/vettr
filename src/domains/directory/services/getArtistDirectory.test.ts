import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import type { Artist } from "@/generated/prisma/client";

import { getArtistDirectory } from "./getArtistDirectory";

// Mocked-Prisma unit test (architecture.md §7): the service is a query
// plus a field mapping, so we stub findMany's rows and assert both the
// mapped output and the exact query payload sent.
function buildArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: "artist-1",
    name: "Directory Test Artist",
    instagramHandle: "directory_test_artist",
    email: "artist-1@example.com",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    avatarUrl: null,
    bio: null,
    location: null,
    stripeConnectAccountId: null,
    stripeConnectChargesEnabled: false,
    stripeConnectPayoutsEnabled: false,
    ...overrides,
  };
}

describe("getArtistDirectory", () => {
  it("returns an artist with directory fields populated", async () => {
    prismaMock.artist.findMany.mockResolvedValue([
      buildArtist({
        avatarUrl: "https://utfs.io/f/e2e-fixture-avatar.jpg",
        bio: "Fine line and botanical work.",
        location: "London, UK",
      }),
    ]);

    const result = await getArtistDirectory();

    expect(result).toEqual([
      {
        id: "artist-1",
        name: "Directory Test Artist",
        instagramHandle: "directory_test_artist",
        avatarUrl: "https://utfs.io/f/e2e-fixture-avatar.jpg",
        bio: "Fine line and botanical work.",
        location: "London, UK",
      },
    ]);
  });

  it("includes an artist with no directory fields set, as nulls", async () => {
    prismaMock.artist.findMany.mockResolvedValue([buildArtist()]);

    const result = await getArtistDirectory();

    expect(result[0]).toMatchObject({
      avatarUrl: null,
      bio: null,
      location: null,
    });
  });

  it("queries artists ordered by name ascending and preserves that order", async () => {
    prismaMock.artist.findMany.mockResolvedValue([
      buildArtist({ id: "a", name: "Alpha Studio" }),
      buildArtist({ id: "z", name: "Zeta Studio" }),
    ]);

    const result = await getArtistDirectory();

    expect(prismaMock.artist.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
    });
    expect(result.map((artist) => artist.id)).toEqual(["a", "z"]);
  });

  it("exposes only the directory DTO fields (no email or Stripe data)", async () => {
    prismaMock.artist.findMany.mockResolvedValue([
      buildArtist({
        stripeConnectAccountId: "acct_123",
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
      }),
    ]);

    const [entry] = await getArtistDirectory();

    expect(Object.keys(entry).sort()).toEqual([
      "avatarUrl",
      "bio",
      "id",
      "instagramHandle",
      "location",
      "name",
    ]);
  });

  it("returns an empty list when there are no artists", async () => {
    prismaMock.artist.findMany.mockResolvedValue([]);

    await expect(getArtistDirectory()).resolves.toEqual([]);
  });
});
