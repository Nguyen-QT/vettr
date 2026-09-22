import type { ApprovedUnpaidRequestSummary } from "@/domains/booking/types";
import { prisma } from "@/lib/prisma";

import type { PayableDeposits } from "../types";

// Domain Service (CLAUDE.md 7.1.8): a pure join against
// ArtistDepositSetting -- takes the client's approved/unpaid requests
// as input (see booking's getApprovedUnpaidRequestSummaries) rather
// than querying BookingRequest itself, so billing never touches
// booking's table directly; the caller (the client dashboard page)
// composes both reads. Batches the settings lookup across every
// involved artist in one query rather than one per request.
export async function getPayableDeposits(
  requests: ApprovedUnpaidRequestSummary[]
): Promise<PayableDeposits> {
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
