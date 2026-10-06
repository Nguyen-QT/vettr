import { artistHandleSchema } from "@/lib/artistHandle";
import { prisma } from "@/lib/prisma";

import type { PublicArtistProfile } from "../types";

// Data Gateway -> Domain Service boundary (54.1.2.2): looks up the public
// profile for `/@handle`. Input is normalised and validated with the shared
// artistHandleSchema; anything invalid (empty, oversized, reserved, `.rsc`)
// can never match a stored handle, so it returns null without a query.
// DB errors propagate -- the orchestrating page owns translating them.
export async function getPublicArtistProfileByHandle(
  handle: string
): Promise<PublicArtistProfile | null> {
  const parsed = artistHandleSchema.safeParse(handle);
  if (!parsed.success) {
    return null;
  }

  const artist = await prisma.artist.findUnique({
    where: { handle: parsed.data },
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

  if (artist === null) {
    return null;
  }

  return {
    id: artist.id,
    handle: artist.handle,
    name: artist.name,
    instagramHandle: artist.instagramHandle,
    avatarUrl: artist.avatarUrl,
    bio: artist.bio,
    location: artist.location,
  };
}
