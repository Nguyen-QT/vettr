import { prisma } from "@/lib/prisma";

// Write command (CLAUDE.md 7.2.3): persists the deposit amount and
// Stripe PaymentIntent id billing just created. depositAmount is a
// snapshot, not a live read of ArtistDepositSetting (CLAUDE.md 7.1),
// so a later change to the artist's per-tier amount never
// retroactively alters an in-flight or already-paid request.
//
// Compare-and-set (56.4): writes only while the booking is APPROVED and
// still stores the PaymentIntent the caller replaced (null: none stored
// yet), or already stores the new one (a duplicate request). The check
// and the write are one statement, so a cancel or a newer PaymentIntent
// that commits after the caller's read is never overwritten. Returns
// whether it wrote; billing hands out a client secret only on true.
export async function recordDepositPaymentIntent(
  bookingRequestId: string,
  data: {
    depositAmount: number;
    stripePaymentIntentId: string;
    replacedPaymentIntentId: string | null;
  }
): Promise<boolean> {
  const { count } = await prisma.bookingRequest.updateMany({
    where: {
      id: bookingRequestId,
      status: "APPROVED",
      // OR, not `in`: `IN (NULL, ...)` never matches a NULL column, while
      // Prisma turns `stripePaymentIntentId: null` into `IS NULL`.
      OR: [
        { stripePaymentIntentId: data.replacedPaymentIntentId },
        { stripePaymentIntentId: data.stripePaymentIntentId },
      ],
    },
    data: {
      depositAmount: data.depositAmount,
      stripePaymentIntentId: data.stripePaymentIntentId,
    },
  });

  return count > 0;
}
