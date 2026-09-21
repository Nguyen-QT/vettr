-- CreateTable
CREATE TABLE "ArtistWeeklyHours" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "availableTimes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "ArtistWeeklyHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistScheduleOverride" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "availableTimes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "artistId" TEXT NOT NULL,

    CONSTRAINT "ArtistScheduleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistWeeklyHours_artistId_dayOfWeek_key" ON "ArtistWeeklyHours"("artistId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistScheduleOverride_artistId_date_key" ON "ArtistScheduleOverride"("artistId", "date");

-- AddForeignKey
ALTER TABLE "ArtistWeeklyHours" ADD CONSTRAINT "ArtistWeeklyHours_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistScheduleOverride" ADD CONSTRAINT "ArtistScheduleOverride_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
