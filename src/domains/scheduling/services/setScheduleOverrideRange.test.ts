import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { setScheduleOverrideRange } from "./setScheduleOverrideRange";

// Mocked-Prisma unit test (architecture.md §7): asserts which dates get
// upserted and with what payload. Row-level outcomes (no duplicates,
// rows outside the range untouched) are Postgres behaviour -- covered
// here only as payload assertions; real-row proof is a 28.3 candidate.
describe("setScheduleOverrideRange", () => {
  const artistId = "artist-1";

  function upsertedDates(): Date[] {
    return prismaMock.artistScheduleOverride.upsert.mock.calls.map(
      ([args]) => args.where.artistId_date!.date as Date
    );
  }

  it("upserts one row per date in an inclusive range, inside a single transaction", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);

    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-01",
      endDate: "2027-05-03",
      availableTimes: [],
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledTimes(3);
    expect(upsertedDates()).toEqual([
      new Date("2027-05-01T00:00:00"),
      new Date("2027-05-02T00:00:00"),
      new Date("2027-05-03T00:00:00"),
    ]);
    for (const [args] of prismaMock.artistScheduleOverride.upsert.mock.calls) {
      expect(args.update).toEqual({ availableTimes: [] });
      expect(args.create).toEqual({
        artistId,
        date: args.where.artistId_date!.date,
        availableTimes: [],
      });
      expect(args.where.artistId_date!.artistId).toBe(artistId);
    }
  });

  it("handles a single-date range the same as one date", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);

    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-10",
      endDate: "2027-05-10",
      availableTimes: ["11:00"],
    });

    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledWith({
      where: {
        artistId_date: { artistId, date: new Date("2027-05-10T00:00:00") },
      },
      update: { availableTimes: ["11:00"] },
      create: {
        artistId,
        date: new Date("2027-05-10T00:00:00"),
        availableTimes: ["11:00"],
      },
    });
  });

  it("targets the same unique keys on a repeat call so existing rows are updated", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);
    const range = { artistId, startDate: "2027-05-20", endDate: "2027-05-21" };

    await setScheduleOverrideRange({ ...range, availableTimes: ["11:00"] });
    const firstDates = upsertedDates();
    await setScheduleOverrideRange({
      ...range,
      availableTimes: ["14:00", "17:30"],
    });

    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledTimes(4);
    expect(upsertedDates().slice(2)).toEqual(firstDates);
    expect(
      prismaMock.artistScheduleOverride.upsert.mock.calls[2][0].update
    ).toEqual({ availableTimes: ["14:00", "17:30"] });
  });

  it("does not upsert dates outside the range", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);

    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-06-01",
      endDate: "2027-06-02",
      availableTimes: [],
    });

    const times = upsertedDates().map((date) => date.getTime());
    expect(times).not.toContain(new Date("2027-06-03T00:00:00").getTime());
    expect(times).not.toContain(new Date("2027-05-31T00:00:00").getTime());
  });

  it("is a safe no-op when endDate is before startDate", async () => {
    await setScheduleOverrideRange({
      artistId,
      startDate: "2027-05-15",
      endDate: "2027-05-14",
      availableTimes: ["11:00"],
    });

    expect(prismaMock.artistScheduleOverride.upsert).not.toHaveBeenCalled();
  });
});
