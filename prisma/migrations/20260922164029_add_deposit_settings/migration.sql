-- AlterTable
ALTER TABLE "IntakeRequest" ADD COLUMN     "depositAmount" DECIMAL(10,2),
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateTable
CREATE TABLE "ArtistDepositSetting" (
    "id" TEXT NOT NULL,
    "tier" "ComplexityTier" NOT NULL,
    "depositAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "ArtistDepositSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistDepositSetting_artistId_tier_key" ON "ArtistDepositSetting"("artistId", "tier");

-- AddForeignKey
ALTER TABLE "ArtistDepositSetting" ADD CONSTRAINT "ArtistDepositSetting_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
