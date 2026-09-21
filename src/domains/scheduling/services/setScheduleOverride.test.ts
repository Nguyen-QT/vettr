import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { setScheduleOverride } from "./setScheduleOverride";

// Hits the real local Postgres database, same as the other scheduling
// service tests.
describe("setScheduleOverride", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Schedule Override Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.artistScheduleOverride.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a row when none exists for that date", async () => {
    const date = "2027-04-01";
    await setScheduleOverride({ artistId, date, availableTimes: ["11:00"] });

    const row = await prisma.artistScheduleOverride.findUnique({
      where: { artistId_date: { artistId, date: new Date(`${date}T00:00:00`) } },
    });
    expect(row?.availableTimes).toEqual(["11:00"]);
  });

  it("updates the existing row instead of creating a duplicate", async () => {
    const date = "2027-04-02";
    await setScheduleOverride({ artistId, date, availableTimes: ["11:00"] });
    await setScheduleOverride({
      artistId,
      date,
      availableTimes: ["14:00", "17:30"],
    });

    const rows = await prisma.artistScheduleOverride.findMany({
      where: { artistId, date: new Date(`${date}T00:00:00`) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].availableTimes).toEqual(["14:00", "17:30"]);
  });

  it("allows a full blackout with an empty availableTimes array", async () => {
    const date = "2027-04-03";
    await setScheduleOverride({ artistId, date, availableTimes: [] });

    const row = await prisma.artistScheduleOverride.findUnique({
      where: { artistId_date: { artistId, date: new Date(`${date}T00:00:00`) } },
    });
    expect(row?.availableTimes).toEqual([]);
  });

  it("does not affect a different date for the same artist", async () => {
    await setScheduleOverride({
      artistId,
      date: "2027-04-04",
      availableTimes: [],
    });

    const otherDate = await prisma.artistScheduleOverride.findUnique({
      where: {
        artistId_date: { artistId, date: new Date("2027-04-05T00:00:00") },
      },
    });
    expect(otherDate).toBeNull();
  });
});
