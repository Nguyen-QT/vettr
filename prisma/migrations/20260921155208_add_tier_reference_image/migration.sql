-- CreateTable
CREATE TABLE "TierReferenceImage" (
    "id" TEXT NOT NULL,
    "tier" "ComplexityTier" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "TierReferenceImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TierReferenceImage_artistId_tier_idx" ON "TierReferenceImage"("artistId", "tier");

-- AddForeignKey
ALTER TABLE "TierReferenceImage" ADD CONSTRAINT "TierReferenceImage_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
