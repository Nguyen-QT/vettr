-- AlterTable
ALTER TABLE "DepositRefund" ADD COLUMN     "retryAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DepositRefund_status_updatedAt_idx" ON "DepositRefund"("status", "updatedAt");

-- Backfill (56.7): both cancel paths refund a paid deposit in full (56.2),
-- so a paid, cancelled or declined booking with no DepositRefund row is
-- owed a refund that nothing recorded (a failed intent insert, or a crash
-- after the cancel committed). Record it as an id-less PENDING row, which
-- is what the retry sweep reads. From 56.7.2.2 the cancel paths insert the
-- row in their own transaction, so no new ones appear. A booking with no
-- PaymentIntent is skipped: refundDeposit can't refund it, and the column
-- is NOT NULL. ON CONFLICT covers a refundDeposit insert that lands while
-- this migration runs. retryAttempts takes its default of 0. Ids and
-- updatedAt are set here for the same reasons as in
-- 20261011013021_add_deposit_refund.
INSERT INTO "DepositRefund" ("id", "status", "stripePaymentIntentId", "bookingRequestId", "updatedAt")
SELECT gen_random_uuid()::text, 'PENDING', "stripePaymentIntentId", "id", CURRENT_TIMESTAMP
FROM "BookingRequest"
WHERE "depositPaid" = true
  AND "status" IN ('CANCELLED_BY_CLIENT', 'CANCELLED_BY_ARTIST', 'DECLINED')
  AND "stripePaymentIntentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DepositRefund" WHERE "DepositRefund"."bookingRequestId" = "BookingRequest"."id"
  )
ON CONFLICT ("bookingRequestId") DO NOTHING;
