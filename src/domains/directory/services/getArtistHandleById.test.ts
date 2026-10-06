import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import type { Artist } from "@/generated/prisma/client";

import { getArtistHandleById } from "./getArtistHandleById";

function buildArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: "artist-1",
    name: "Handle Test Artist",
    instagramHandle: "handle_test_artist",
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

describe("getArtistHandleById", () => {
  it("returns the handle when the artist exists", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(buildArtist());

    await expect(getArtistHandleById("artist-1")).resolves.toBe("studio");
  });

  it("returns null when no artist has the id", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    await expect(getArtistHandleById("missing")).resolves.toBeNull();
  });

  it("queries by id with a handle-only select", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    await getArtistHandleById("artist-1");

    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { id: "artist-1" },
      select: { handle: true },
    });
  });

  it("propagates database errors", async () => {
    prismaMock.artist.findUnique.mockRejectedValue(new Error("db down"));

    await expect(getArtistHandleById("artist-1")).rejects.toThrow("db down");
  });
});
