-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN     "depositRefunded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeRefundId" TEXT;
