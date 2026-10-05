import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { setScheduleOverride } from "./setScheduleOverride";

// Mocked-Prisma unit test (architecture.md §7): asserts the exact upsert
// payload. "No duplicate row" is the (artistId, date) unique key's job in
// Postgres -- a 28.3 integration-tier candidate, not faked here.
describe("setScheduleOverride", () => {
  const artistId = "artist-1";

  it("upserts keyed on artist + local-midnight date with the same times for create and update", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);
    const date = "2027-04-01";
    const parsed = new Date(`${date}T00:00:00`);

    await setScheduleOverride({ artistId, date, availableTimes: ["11:00"] });

    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledTimes(1);
    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledWith({
      where: { artistId_date: { artistId, date: parsed } },
      update: { availableTimes: ["11:00"] },
      create: { artistId, date: parsed, availableTimes: ["11:00"] },
    });
  });

  it("targets the same unique key on a repeat call so the existing row is updated", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);
    const date = "2027-04-02";

    await setScheduleOverride({ artistId, date, availableTimes: ["11:00"] });
    await setScheduleOverride({
      artistId,
      date,
      availableTimes: ["14:00", "17:30"],
    });

    const [first, second] = prismaMock.artistScheduleOverride.upsert.mock.calls;
    expect(first[0].where).toEqual(second[0].where);
    expect(second[0].update).toEqual({ availableTimes: ["14:00", "17:30"] });
  });

  it("passes an empty availableTimes array through as a full blackout", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);

    await setScheduleOverride({
      artistId,
      date: "2027-04-03",
      availableTimes: [],
    });

    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { availableTimes: [] } })
    );
  });

  it("only touches the requested date", async () => {
    prismaMock.artistScheduleOverride.upsert.mockResolvedValue({} as never);

    await setScheduleOverride({
      artistId,
      date: "2027-04-04",
      availableTimes: [],
    });

    expect(prismaMock.artistScheduleOverride.upsert).toHaveBeenCalledTimes(1);
    expect(
      prismaMock.artistScheduleOverride.upsert.mock.calls[0][0].where
    ).toEqual({
      artistId_date: { artistId, date: new Date("2027-04-04T00:00:00") },
    });
  });
});
