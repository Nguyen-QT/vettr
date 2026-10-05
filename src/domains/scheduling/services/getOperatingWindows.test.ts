import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getOperatingWindows } from "./getOperatingWindows";

// Mocked-Prisma unit test (architecture.md §7): delegate return values
// drive the override -> weekly -> default-open precedence branches.
describe("getOperatingWindows", () => {
  const artistId = "artist-1";

  it("defaults to every fixed time open when nothing is configured", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue(null);
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue(null);

    const result = await getOperatingWindows(artistId, "2027-03-01");

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
  });

  it("uses the weekly-hours row for that date's day of week when present", async () => {
    const date = "2027-03-02";
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue(null);
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue({
      availableTimes: ["11:00"],
    } as never);

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual(["11:00"]);
    expect(prismaMock.artistWeeklyHours.findUnique).toHaveBeenCalledWith({
      where: { artistId_dayOfWeek: { artistId, dayOfWeek } },
    });
  });

  it("looks up weekly hours only for the requested date's day of week", async () => {
    const date = "2027-03-03";
    const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue(null);
    // The lookup is keyed on the date's own day, so a row stored for a
    // different day is simply never returned by the database.
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue(null);

    const result = await getOperatingWindows(artistId, date);

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
    const [args] = prismaMock.artistWeeklyHours.findUnique.mock.calls[0];
    expect(args.where.artistId_dayOfWeek).toEqual({ artistId, dayOfWeek });
  });

  it("treats an override with an empty availableTimes as a full blackout", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue({
      availableTimes: [],
    } as never);

    const result = await getOperatingWindows(artistId, "2027-03-04");

    expect(result).toEqual([]);
  });

  it("lets a same-date override take precedence over the weekly-hours row", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue({
      availableTimes: ["14:00", "17:30"],
    } as never);
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue({
      availableTimes: ["11:00"],
    } as never);

    const result = await getOperatingWindows(artistId, "2027-03-05");

    expect(result).toEqual(["14:00", "17:30"]);
    expect(prismaMock.artistWeeklyHours.findUnique).not.toHaveBeenCalled();
  });

  it("looks up the override by the requested date only, so another date's override can't apply", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue(null);
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue(null);

    const result = await getOperatingWindows(artistId, "2027-03-07");

    expect(result).toEqual(["11:00", "14:00", "17:30"]);
    expect(prismaMock.artistScheduleOverride.findUnique).toHaveBeenCalledWith({
      where: {
        artistId_date: { artistId, date: new Date("2027-03-07T00:00:00") },
      },
    });
  });
});
