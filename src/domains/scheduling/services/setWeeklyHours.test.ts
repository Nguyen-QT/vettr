import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { setWeeklyHours } from "./setWeeklyHours";

// Mocked-Prisma unit test (architecture.md §7): asserts the exact upsert
// payload. "No duplicate row" is the (artistId, dayOfWeek) unique key's
// job in Postgres -- a 28.3 integration-tier candidate, not faked here.
describe("setWeeklyHours", () => {
  const artistId = "artist-1";

  it("upserts keyed on artist + day of week with the same times for create and update", async () => {
    prismaMock.artistWeeklyHours.upsert.mockResolvedValue({} as never);

    await setWeeklyHours({ artistId, dayOfWeek: 1, availableTimes: ["11:00"] });

    expect(prismaMock.artistWeeklyHours.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistWeeklyHours.upsert).toHaveBeenCalledWith({
      where: { artistId_dayOfWeek: { artistId, dayOfWeek: 1 } },
      update: { availableTimes: ["11:00"] },
      create: { artistId, dayOfWeek: 1, availableTimes: ["11:00"] },
    });
  });

  it("targets the same unique key on a repeat call so the existing row is updated", async () => {
    prismaMock.artistWeeklyHours.upsert.mockResolvedValue({} as never);

    await setWeeklyHours({ artistId, dayOfWeek: 2, availableTimes: ["11:00"] });
    await setWeeklyHours({
      artistId,
      dayOfWeek: 2,
      availableTimes: ["14:00", "17:30"],
    });

    const [first, second] = prismaMock.artistWeeklyHours.upsert.mock.calls;
    expect(first[0].where).toEqual(second[0].where);
    expect(second[0].update).toEqual({ availableTimes: ["14:00", "17:30"] });
  });

  it("passes an empty availableTimes array through to close a day entirely", async () => {
    prismaMock.artistWeeklyHours.upsert.mockResolvedValue({} as never);

    await setWeeklyHours({ artistId, dayOfWeek: 3, availableTimes: [] });

    expect(prismaMock.artistWeeklyHours.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { availableTimes: [] },
        create: { artistId, dayOfWeek: 3, availableTimes: [] },
      })
    );
  });

  it("only touches the requested day of week", async () => {
    prismaMock.artistWeeklyHours.upsert.mockResolvedValue({} as never);

    await setWeeklyHours({ artistId, dayOfWeek: 4, availableTimes: ["11:00"] });

    expect(prismaMock.artistWeeklyHours.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistWeeklyHours.upsert.mock.calls[0][0].where).toEqual({
      artistId_dayOfWeek: { artistId, dayOfWeek: 4 },
    });
  });
});
