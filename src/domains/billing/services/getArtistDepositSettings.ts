import { COMPLEXITY_TIERS } from "@/domains/booking/constants";
import { prisma } from "@/lib/prisma";

import type { ArtistDepositSettings } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 7.1): reads one
// artist's per-tier deposit amounts. Every tier is always present as a
// key (see ArtistDepositSettings), null when the artist hasn't
// configured a deposit for that tier yet.
export async function getArtistDepositSettings(
  artistId: string
): Promise<ArtistDepositSettings> {
  const rows = await prisma.artistDepositSetting.findMany({
    where: { artistId },
  });

  const result = Object.fromEntries(
    COMPLEXITY_TIERS.map((tier) => [tier, null])
  ) as ArtistDepositSettings;

  for (const row of rows) {
    result[row.tier] = Number(row.depositAmount);
  }

  return result;
}
