import { prisma } from "@/lib/prisma";

import type { ArtistConnectStatus } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 24.1.2): reads an
// artist's current Stripe Connect onboarding status. A missing artist
// reads the same as a never-onboarded one -- this is only ever called
// with a session-derived artistId, so a mismatch here isn't a
// meaningful state to distinguish from "not connected yet".
export async function getArtistConnectStatus(
  artistId: string
): Promise<ArtistConnectStatus> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: {
      stripeConnectAccountId: true,
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
    },
  });

  return {
    connected: artist?.stripeConnectAccountId != null,
    chargesEnabled: artist?.stripeConnectChargesEnabled ?? false,
    payoutsEnabled: artist?.stripeConnectPayoutsEnabled ?? false,
  };
}
