import type { Prisma } from "@/generated/prisma/client";

type PrismaTransactionClient = Prisma.TransactionClient;

// Domain Service (56.7): the transaction-composable form of
// recordDepositRefundIntent's insert, against whatever transaction client
// the caller supplies. Inserts a PENDING row with no refund id unless the
// booking already has one; an existing row is left untouched. It is one
// INSERT ... ON CONFLICT DO NOTHING, so a conflict on the bookingRequestId
// index never aborts the caller's transaction, which a create that caught
// P2002 would: Postgres aborts a transaction on any error. Used by
// recordDepositRefundIntent, and by booking's cancelBookingRequest/
// cancelApprovedBookingAsArtist so the cancel and the intent commit
// together (56.7.2.2). Database errors aren't caught: inside a transaction
// they roll back the caller's whole write.
export async function insertDepositRefundIntent(
  tx: PrismaTransactionClient,
  bookingRequestId: string,
  stripePaymentIntentId: string
): Promise<void> {
  await tx.depositRefund.createMany({
    data: [{ bookingRequestId, stripePaymentIntentId }],
    skipDuplicates: true,
  });
}
