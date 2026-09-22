import { prisma } from "@/lib/prisma";

import type { ApprovedUnpaidRequestSummary } from "../types";

// Data Gateway -> Domain Service boundary (CLAUDE.md 7.1.8): every
// APPROVED, unpaid request a client has, projected down to only the
// fields a cross-domain caller needs (billing's getPayableDeposits) --
// keeps that lookup billing-agnostic on booking's side, and keeps
// billing from ever needing its own Prisma access to BookingRequest.
export async function getApprovedUnpaidRequestSummaries(
  clientProfileId: string
): Promise<ApprovedUnpaidRequestSummary[]> {
  return prisma.bookingRequest.findMany({
    where: { clientId: clientProfileId, status: "APPROVED", depositPaid: false },
    select: { id: true, artistId: true, tier: true },
  });
}
