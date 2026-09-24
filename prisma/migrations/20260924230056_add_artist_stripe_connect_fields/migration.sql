-- AlterTable
ALTER TABLE "Artist" ADD COLUMN     "stripeConnectAccountId" TEXT,
ADD COLUMN     "stripeConnectChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeConnectPayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
