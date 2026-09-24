-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- AlterTable
ALTER TABLE "BookingRequest" ADD COLUMN     "paymentMethod" "PaymentMethod";
