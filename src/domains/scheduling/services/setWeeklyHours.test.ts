import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { setWeeklyHours } from "./setWeeklyHours";

// Hits the real local Postgres database, same as the other scheduling
// service tests.
describe("setWeeklyHours", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Weekly Hours Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artistWeeklyHours.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a row when none exists for that day of week", async () => {
    await setWeeklyHours({ artistId, dayOfWeek: 1, availableTimes: ["11:00"] });

    const row = await prisma.artistWeeklyHours.findUnique({
      where: { artistId_dayOfWeek: { artistId, dayOfWeek: 1 } },
    });
    expect(row?.availableTimes).toEqual(["11:00"]);
  });

  it("updates the existing row instead of creating a duplicate", async () => {
    await setWeeklyHours({ artistId, dayOfWeek: 2, availableTimes: ["11:00"] });
    await setWeeklyHours({
      artistId,
      dayOfWeek: 2,
      availableTimes: ["14:00", "17:30"],
    });

    const rows = await prisma.artistWeeklyHours.findMany({
      where: { artistId, dayOfWeek: 2 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].availableTimes).toEqual(["14:00", "17:30"]);
  });

  it("allows closing a day entirely with an empty availableTimes array", async () => {
    await setWeeklyHours({ artistId, dayOfWeek: 3, availableTimes: [] });

    const row = await prisma.artistWeeklyHours.findUnique({
      where: { artistId_dayOfWeek: { artistId, dayOfWeek: 3 } },
    });
    expect(row?.availableTimes).toEqual([]);
  });

  it("does not affect a different day of week for the same artist", async () => {
    await setWeeklyHours({ artistId, dayOfWeek: 4, availableTimes: ["11:00"] });

    const otherDay = await prisma.artistWeeklyHours.findUnique({
      where: { artistId_dayOfWeek: { artistId, dayOfWeek: 5 } },
    });
    expect(otherDay).toBeNull();
  });
});
