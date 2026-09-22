import { prisma } from "@/lib/prisma";

// Write command (CLAUDE.md 7.2.3): persists the deposit amount and
// Stripe PaymentIntent id billing just created. depositAmount is a
// snapshot, not a live read of ArtistDepositSetting (CLAUDE.md 7.1),
// so a later change to the artist's per-tier amount never
// retroactively alters an in-flight or already-paid request.
export async function recordDepositPaymentIntent(
  intakeRequestId: string,
  data: { depositAmount: number; stripePaymentIntentId: string }
): Promise<void> {
  await prisma.intakeRequest.update({
    where: { id: intakeRequestId },
    data: {
      depositAmount: data.depositAmount,
      stripePaymentIntentId: data.stripePaymentIntentId,
    },
  });
}
