import type { Prisma } from "@/generated/prisma/client";

import { STRIKE_THRESHOLD } from "../constants";

type PrismaTransactionClient = Prisma.TransactionClient;

// Shared by cancelIntakeRequest (an APPROVED-booking client
// cancellation) and markAppointmentNoShow (CLAUDE.md 5.6) -- the only
// two transitions that count as a cancellation strike against a
// ClientProfile, per the project's "Flagging Mechanism". Must run
// inside the caller's own transaction, alongside the status update.
export async function applyCancellationStrike(
  tx: PrismaTransactionClient,
  clientId: string
): Promise<void> {
  const client = await tx.clientProfile.update({
    where: { id: clientId },
    data: { cancellationCount: { increment: 1 } },
  });

  if (client.cancellationCount >= STRIKE_THRESHOLD) {
    await tx.clientProfile.update({
      where: { id: clientId },
      data: { enforcePrecharge: true },
    });
  }
}
