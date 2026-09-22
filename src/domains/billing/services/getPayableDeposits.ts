import { prisma } from "@/lib/prisma";

import type { PayableDeposits } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 7.1.8): every
// APPROVED, unpaid IntakeRequest a client has whose artist has
// configured a deposit amount for its tier, keyed by intakeRequestId
// for the client dashboard's "Pay Deposit" card. Deliberately queried
// from billing rather than extending intake's getClientBookings --
// this is billing's own join (IntakeRequest x ArtistDepositSetting),
// so intake's service/types stay untouched. Batches the settings
// lookup across every involved artist rather than one query per
// request.
export async function getPayableDeposits(
  clientProfileId: string
): Promise<PayableDeposits> {
  const requests = await prisma.intakeRequest.findMany({
    where: { clientId: clientProfileId, status: "APPROVED", depositPaid: false },
    select: { id: true, artistId: true, tier: true },
  });

  if (requests.length === 0) {
    return {};
  }

  const artistIds = [...new Set(requests.map((request) => request.artistId))];
  const settings = await prisma.artistDepositSetting.findMany({
    where: { artistId: { in: artistIds } },
  });

  const amountByArtistTier = new Map(
    settings.map((setting) => [
      `${setting.artistId}:${setting.tier}`,
      Number(setting.depositAmount),
    ])
  );

  const result: PayableDeposits = {};
  for (const request of requests) {
    const amount = amountByArtistTier.get(`${request.artistId}:${request.tier}`);
    if (amount !== undefined) {
      result[request.id] = amount;
    }
  }
  return result;
}
