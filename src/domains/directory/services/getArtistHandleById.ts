import { prisma } from "@/lib/prisma";

import type { PublicArtistProfile } from "../types";

// Data Gateway -> Domain Service boundary (54.1.2.3): resolves an artist id
// to its public `/@handle` so the legacy `/book/[artistId]` route can 308 to
// `/@handle/book` (54.1.6.2). Returns only the handle (already public) and
// null for an unknown id. DB errors propagate -- the orchestrating page owns
// translating them.
export async function getArtistHandleById(
  artistId: string
): Promise<PublicArtistProfile["handle"] | null> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { handle: true },
  });

  return artist?.handle ?? null;
}
