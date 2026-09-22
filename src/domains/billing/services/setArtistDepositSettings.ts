import { prisma } from "@/lib/prisma";

import type { SetArtistDepositSettingInput } from "../types";

// Write command (CLAUDE.md 7.1): upserts the deposit amount an artist
// requires for one tier.
export async function setArtistDepositSettings(
  input: SetArtistDepositSettingInput
): Promise<void> {
  await prisma.artistDepositSetting.upsert({
    where: {
      artistId_tier: {
        artistId: input.artistId,
        tier: input.tier,
      },
    },
    update: { depositAmount: input.depositAmount },
    create: {
      artistId: input.artistId,
      tier: input.tier,
      depositAmount: input.depositAmount,
    },
  });
}
