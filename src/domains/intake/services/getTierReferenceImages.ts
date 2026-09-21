import { prisma } from "@/lib/prisma";

import { COMPLEXITY_TIERS } from "../constants";
import type { TierReferenceImages } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 4.6): groups one
// artist's TierReferenceImage rows by tier for the client-facing
// intake form. Every tier is always present as a key (see
// TierReferenceImages), even if the artist hasn't added any images
// for it yet.
export async function getTierReferenceImages(
  artistId: string
): Promise<TierReferenceImages> {
  const rows = await prisma.tierReferenceImage.findMany({
    where: { artistId },
    orderBy: { createdAt: "asc" },
  });

  const result = Object.fromEntries(
    COMPLEXITY_TIERS.map((tier) => [tier, [] as string[]])
  ) as TierReferenceImages;

  for (const row of rows) {
    result[row.tier].push(row.imageUrl);
  }

  return result;
}
