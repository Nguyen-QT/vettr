import { prisma } from "@/lib/prisma";

import type { ArtistDirectoryEntry } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 5.3.2): every
// artist on the platform, for the public discovery directory. Purely a
// query + mapping, same spirit as getPendingIntakeRequests -- no
// filtering (e.g. an "active"/opted-in flag) exists yet to apply.
export async function getArtistDirectory(): Promise<ArtistDirectoryEntry[]> {
  const artists = await prisma.artist.findMany({
    orderBy: { name: "asc" },
  });

  return artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    instagramHandle: artist.instagramHandle,
    avatarUrl: artist.avatarUrl,
    bio: artist.bio,
    location: artist.location,
  }));
}
