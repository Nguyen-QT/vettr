import { prisma } from "@/lib/prisma";

import type { IntakeRequestDepositView } from "../types";

// Narrow cross-domain read (CLAUDE.md 7.2.3) -- exposes only what
// billing's createDepositPaymentIntent needs, without billing ever
// querying IntakeRequest directly.
export async function getIntakeRequestForDeposit(
  intakeRequestId: string
): Promise<IntakeRequestDepositView | null> {
  return prisma.intakeRequest.findUnique({
    where: { id: intakeRequestId },
    select: {
      id: true,
      clientId: true,
      artistId: true,
      tier: true,
      status: true,
      depositPaid: true,
    },
  });
}
