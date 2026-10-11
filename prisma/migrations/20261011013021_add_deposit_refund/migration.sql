-- Guard (56.6): every DepositRefund row records the refunded PaymentIntent.
-- refundDeposit never refunds without one, so a refunded booking that has
-- none was edited by hand. Refuse to guess, and surface it as a hard failure
-- so it gets resolved by hand (mirrors 20261006182220_add_artist_handle).
DO $$
DECLARE
  bad_id TEXT;
BEGIN
  SELECT "id" INTO bad_id
  FROM "BookingRequest"
  WHERE "depositRefunded" = true AND "stripePaymentIntentId" IS NULL
  LIMIT 1;

  IF bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot backfill DepositRefund: booking request % is marked refunded but has no stripePaymentIntentId', bad_id;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "DepositRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "DepositRefund" (
    "id" TEXT NOT NULL,
    "status" "DepositRefundStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT NOT NULL,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookingRequestId" TEXT NOT NULL,

    CONSTRAINT "DepositRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepositRefund_stripeRefundId_key" ON "DepositRefund"("stripeRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "DepositRefund_bookingRequestId_key" ON "DepositRefund"("bookingRequestId");

-- AddForeignKey
ALTER TABLE "DepositRefund" ADD CONSTRAINT "DepositRefund_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "BookingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (56.6): every refund recorded so far becomes a SUCCEEDED row,
-- which is what depositRefunded = true claimed. Ids are generated here
-- because cuid() exists only in Prisma, and updatedAt is set explicitly
-- because @updatedAt has no database default.
INSERT INTO "DepositRefund" ("id", "status", "stripePaymentIntentId", "stripeRefundId", "bookingRequestId", "updatedAt")
SELECT gen_random_uuid()::text, 'SUCCEEDED', "stripePaymentIntentId", "stripeRefundId", "id", CURRENT_TIMESTAMP
FROM "BookingRequest"
WHERE "depositRefunded" = true;
