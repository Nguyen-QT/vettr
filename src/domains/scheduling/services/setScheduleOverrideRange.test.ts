import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { setScheduleOverrideRange } from "./setScheduleOverrideRange";

// Hits the real local Postgres database, same as the other scheduling
// service tests.
describe("setScheduleOverrideRange", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Schedule Override Range Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artistScheduleOverride.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates one row per date in an inclusive range", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-01",
      endDate: "2027-05-03",
      availableTimes: [],
    });

    const rows = await prisma.artistScheduleOverride.findMany({
      where: { artistId },
      orderBy: { date: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.availableTimes.length === 0)).toBe(true);

    for (const date of ["2027-05-01", "2027-05-02", "2027-05-03"]) {
      const row = await prisma.artistScheduleOverride.findUnique({
        where: { artistId_date: { artistId, date: new Date(`${date}T00:00:00`) } },
      });
      expect(row).not.toBeNull();
    }
  });

  it("handles a single-date range the same as one date", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-10",
      endDate: "2027-05-10",
      availableTimes: ["11:00"],
    });

    const rows = await prisma.artistScheduleOverride.findMany({
      where: { artistId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].availableTimes).toEqual(["11:00"]);
  });

  it("updates existing rows in the range instead of duplicating them", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-20",
      endDate: "2027-05-21",
      availableTimes: ["11:00"],
    });
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-20",
      endDate: "2027-05-21",
      availableTimes: ["14:00", "17:30"],
    });

    const rows = await prisma.artistScheduleOverride.findMany({
      where: { artistId },
      orderBy: { date: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.availableTimes.length === 2)).toBe(true);
  });

  it("does not affect dates outside the range", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-06-01",
      endDate: "2027-06-02",
      availableTimes: [],
    });

    const outsideRange = await prisma.artistScheduleOverride.findUnique({
      where: {
        artistId_date: { artistId, date: new Date("2027-06-03T00:00:00") },
      },
    });
    expect(outsideRange).toBeNull();
  });

  it("is a safe no-op when endDate is before startDate", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-15",
      endDate: "2027-05-14",
      availableTimes: ["11:00"],
    });

    const rows = await prisma.artistScheduleOverride.findMany({
      where: { artistId },
    });
    expect(rows).toHaveLength(0);
  });
});
