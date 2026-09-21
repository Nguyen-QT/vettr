import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { getOperatingWindows } from "./getOperatingWindows";

// Hits the real local Postgres database, same as getAvailableSlots.test.ts.
describe("getOperatingWindows", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Operating Windows Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artistScheduleOverride.deleteMany({ where: { artistId } });
    await prisma.artistWeeklyHours.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("defaults to every fixed time open when nothing is configured", async () => {
    const result = await getOperatingWindows(artistId, "2027-03-01");

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
  });

  it("uses the weekly-hours row for that date's day of week when present", async () => {
    const date = "2027-03-02";
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

    await prisma.artistWeeklyHours.create({
      data: { artistId, dayOfWeek, availableTimes: ["11:00"] },
    });

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual(["11:00"]);
  });

  it("does not let a weekly-hours row for a different day of week affect this date", async () => {
    const date = "2027-03-03";
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    const otherDayOfWeek = (dayOfWeek + 1) % 7;

    await prisma.artistWeeklyHours.create({
      data: { artistId, dayOfWeek: otherDayOfWeek, availableTimes: ["11:00"] },
    });

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
  });

  it("treats an override with an empty availableTimes as a full blackout", async () => {
    const date = "2027-03-04";

    await prisma.artistScheduleOverride.create({
      data: { artistId, date: new Date(`${date}T00:00:00`), availableTimes: [] },
    });

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual([]);
  });

  it("lets a same-date override take precedence over the weekly-hours row", async () => {
    const date = "2027-03-05";
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

    await prisma.artistWeeklyHours.create({
      data: { artistId, dayOfWeek, availableTimes: ["11:00"] },
    });
    await prisma.artistScheduleOverride.create({
      data: {
        artistId,
        date: new Date(`${date}T00:00:00`),
        availableTimes: ["14:00", "17:30"],
      },
    });

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual(["14:00", "17:30"]);
  });

  it("does not let an override for a different date affect this date", async () => {
    await prisma.artistScheduleOverride.create({
      data: {
        artistId,
        date: new Date("2027-03-06T00:00:00"),
        availableTimes: [],
      },
    });

    const result = await getOperatingWindows(artistId, "2027-03-07");

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
  });
});
