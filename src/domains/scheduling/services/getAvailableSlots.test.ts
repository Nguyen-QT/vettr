import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it } from "vitest";

import { getAvailableSlots } from "./getAvailableSlots";

// Mocked-Prisma unit test (architecture.md §7): booked rows and operating
// windows are stubbed; the overlap logic is the service's own. Filtering
// by artist/date is asserted via the findMany `where`; proving it against
// real rows is a 28.3 integration-tier candidate.
describe("getAvailableSlots", () => {
  const artistId = "artist-1";

  beforeEach(() => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue(null);
    prismaMock.artistWeeklyHours.findUnique.mockResolvedValue(null);
    prismaMock.timeSlot.findMany.mockResolvedValue([]);
  });

  function stubBooked(slots: Array<[string, string]>): void {
    prismaMock.timeSlot.findMany.mockResolvedValue(
      slots.map(([start, end]) => ({
        startTime: new Date(start),
        endTime: new Date(end),
      })) as never
    );
  }

  it("marks every fixed time available with no existing bookings", async () => {
    const result = await getAvailableSlots(artistId, "2027-02-01");

    expect(result).toEqual([
      { time: "11:00", available: true },
      { time: "14:00", available: true },
      { time: "17:30", available: true },
    ]);
  });

  it("marks only the booked time unavailable, leaving adjacent non-overlapping times free", async () => {
    stubBooked([["2027-02-02T11:00:00", "2027-02-02T14:00:00"]]);

    const result = await getAvailableSlots(artistId, "2027-02-02");

    expect(result).toEqual([
      { time: "11:00", available: false },
      { time: "14:00", available: true },
      { time: "17:30", available: true },
    ]);
  });

  it("marks both times unavailable when a two-slot booking spans them", async () => {
    stubBooked([
      ["2027-02-03T11:00:00", "2027-02-03T14:00:00"],
      ["2027-02-03T14:00:00", "2027-02-03T16:00:00"],
    ]);

    const result = await getAvailableSlots(artistId, "2027-02-03");

    expect(result).toEqual([
      { time: "11:00", available: false },
      { time: "14:00", available: false },
      { time: "17:30", available: true },
    ]);
  });

  it("marks a time unavailable when it's outside the artist's operating windows, even if not booked", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue({
      availableTimes: ["11:00"],
    } as never);

    const result = await getAvailableSlots(artistId, "2027-02-07");

    expect(result).toEqual([
      { time: "11:00", available: true },
      { time: "14:00", available: false },
      { time: "17:30", available: false },
    ]);
  });

  it("marks every time unavailable on a blackout date, even if not booked", async () => {
    prismaMock.artistScheduleOverride.findUnique.mockResolvedValue({
      availableTimes: [],
    } as never);

    const result = await getAvailableSlots(artistId, "2027-02-08");

    expect(result.every((slot) => !slot.available)).toBe(true);
  });

  it("queries only this artist's BOOKED slots overlapping the requested day", async () => {
    await getAvailableSlots(artistId, "2027-02-05");

    const dayStart = new Date("2027-02-05T00:00:00");
    expect(prismaMock.timeSlot.findMany).toHaveBeenCalledWith({
      where: {
        artistId,
        status: "BOOKED",
        startTime: { lt: new Date(dayStart.getTime() + 24 * 60 * 60_000) },
        endTime: { gt: dayStart },
      },
      select: { startTime: true, endTime: true },
    });
  });

  it("ignores a returned booking that doesn't overlap a time's window", async () => {
    // Defensive: a booking on another day that slipped past the query
    // filter must still not block this day's times.
    stubBooked([["2027-02-04T11:00:00", "2027-02-04T14:00:00"]]);

    const result = await getAvailableSlots(artistId, "2027-02-05");

    expect(result.every((slot) => slot.available)).toBe(true);
  });
});
