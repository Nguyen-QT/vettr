import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import type { Artist } from "@/generated/prisma/client";

import { getPublicArtistProfileByHandle } from "./getPublicArtistProfileByHandle";

function buildArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: "artist-1",
    name: "Profile Test Artist",
    instagramHandle: "profile_test_artist",
    handle: "studio",
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

describe("getPublicArtistProfileByHandle", () => {
  it("returns the mapped profile when the artist exists", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(
      buildArtist({
        avatarUrl: "https://utfs.io/f/avatar.jpg",
        bio: "Fine line and botanical work.",
        location: "London, UK",
      })
    );

    await expect(getPublicArtistProfileByHandle("studio")).resolves.toEqual({
      id: "artist-1",
      handle: "studio",
      name: "Profile Test Artist",
      instagramHandle: "profile_test_artist",
      avatarUrl: "https://utfs.io/f/avatar.jpg",
      bio: "Fine line and botanical work.",
      location: "London, UK",
    });
  });

  it("returns null when no artist has the handle", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    await expect(getPublicArtistProfileByHandle("nobody")).resolves.toBeNull();
  });

  it("queries by the normalised handle with a narrow select", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    await getPublicArtistProfileByHandle("@Studio");

    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { handle: "studio" },
      select: {
        id: true,
        handle: true,
        name: true,
        instagramHandle: true,
        avatarUrl: true,
        bio: true,
        location: true,
      },
    });
  });

  it.each(["", "@", "a".repeat(31), ".studio", "admin", "x.rsc"])(
    "returns null without querying for invalid handle %j",
    async (input) => {
      await expect(getPublicArtistProfileByHandle(input)).resolves.toBeNull();
      expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
    }
  );

  it("passes null avatar, bio and location through", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(buildArtist());

    await expect(
      getPublicArtistProfileByHandle("studio")
    ).resolves.toMatchObject({ avatarUrl: null, bio: null, location: null });
  });

  it("exposes only the public DTO fields (no email or Stripe data)", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(
      buildArtist({
        stripeConnectAccountId: "acct_123",
        stripeConnectChargesEnabled: true,
      })
    );

    const profile = await getPublicArtistProfileByHandle("studio");

    expect(Object.keys(profile ?? {}).sort()).toEqual([
      "avatarUrl",
      "bio",
      "handle",
      "id",
      "instagramHandle",
      "location",
      "name",
    ]);
  });
});
