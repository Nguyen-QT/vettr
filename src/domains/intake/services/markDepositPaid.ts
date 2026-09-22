import { prisma } from "@/lib/prisma";

// Write command (CLAUDE.md 7.2.3): flips depositPaid to true once
// billing's Stripe webhook confirms the PaymentIntent succeeded.
export async function markDepositPaid(intakeRequestId: string): Promise<void> {
  await prisma.intakeRequest.update({
    where: { id: intakeRequestId },
    data: { depositPaid: true },
  });
}
