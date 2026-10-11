-- Catch-up backfill (56.6.1.2): between 56.6.1.1's backfill and 56.6.2.2,
-- refundDeposit set only depositRefunded, so a refund from that window has
-- no DepositRefund row. Record it before the flag is dropped.
--
-- Guard: a DepositRefund row needs the refunded PaymentIntent, and
-- refundDeposit never refunds without one, so a refunded booking that has
-- none was edited by hand. Refuse to guess, and surface it as a hard failure
-- so it gets resolved by hand (mirrors 20261011013021_add_deposit_refund).
DO $$
DECLARE
  bad_id TEXT;
BEGIN
  SELECT "id" INTO bad_id
  FROM "BookingRequest"
  WHERE "depositRefunded" = true
    AND "stripePaymentIntentId" IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM "DepositRefund" WHERE "DepositRefund"."bookingRequestId" = "BookingRequest"."id"
    )
  LIMIT 1;

  IF bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill DepositRefund: booking request % is marked refunded but has no stripePaymentIntentId', bad_id;
  END IF;
END $$;

-- Same SUCCEEDED backfill as 20261011013021_add_deposit_refund, limited to
-- bookings that still have no row.
INSERT INTO "DepositRefund" ("id", "status", "stripePaymentIntentId", "stripeRefundId", "bookingRequestId", "updatedAt")
SELECT gen_random_uuid()::text, 'SUCCEEDED', "stripePaymentIntentId", "stripeRefundId", "id", CURRENT_TIMESTAMP
FROM "BookingRequest"
WHERE "depositRefunded" = true
  AND NOT EXISTS (
    SELECT 1 FROM "DepositRefund" WHERE "DepositRefund"."bookingRequestId" = "BookingRequest"."id"
  );

-- DropIndex
DROP INDEX "BookingRequest_stripeRefundId_key";

-- AlterTable
ALTER TABLE "BookingRequest" DROP COLUMN "depositRefunded",
DROP COLUMN "stripeRefundId";
