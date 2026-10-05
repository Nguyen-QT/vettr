import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { createBookingRequest, createIntegrationTracker } from "@/testUtils/integrationDb";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "../constants";
import { confirmTimeSlot } from "./confirmTimeSlot";

// Real-database scheduling tests (28.3.2.4): TimeSlot's GiST exclusion
// constraint is the sole arbiter of double-booking.
const tracker = createIntegrationTracker();

const START = new Date("2040-02-01T11:00:00.000Z");

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function setup(): Promise<{ artistId: string; requestIds: string[] }> {
  const artist = await tracker.createArtist();
  const client = await tracker.createClientProfile();
  const requests = await Promise.all(
    [0, 1].map(() => createBookingRequest({ artistId: artist.id, clientId: client.id }))
  );
  return { artistId: artist.id, requestIds: requests.map((r) => r.id) };
}

describe("scheduling integration", () => {
  beforeEach(async () => {
    await tracker.wipe();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  it("concurrent confirmTimeSlot calls for the same window yield one winner and a handled loser", async () => {
    const { artistId, requestIds } = await setup();

    const results = await Promise.all(
      requestIds.map((bookingRequestId) =>
        confirmTimeSlot({ bookingRequestId, artistId, startTime: START, durationMinutes: 120 })
      )
    );

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toEqual([
      { success: false, error: SLOT_CONFLICT_ERROR_MESSAGE },
    ]);
    expect(await prisma.timeSlot.count({ where: { artistId } })).toBe(1);
  });

  it("adjacent windows both book, but overlapping windows conflict", async () => {
    const { artistId, requestIds } = await setup();
    const [first, second] = requestIds;

    const a = await confirmTimeSlot({
      bookingRequestId: first,
      artistId,
      startTime: START,
      durationMinutes: 180,
    });
    const adjacent = await confirmTimeSlot({
      bookingRequestId: second,
      artistId,
      startTime: addMinutes(START, 180),
      durationMinutes: 60,
    });
    const overlapping = await confirmTimeSlot({
      bookingRequestId: second,
      artistId,
      startTime: addMinutes(START, 120),
      durationMinutes: 60,
    });

    expect(a.success).toBe(true);
    expect(adjacent.success).toBe(true);
    expect(overlapping).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
  });

  it("a RELEASED slot does not block a new booking of the same window", async () => {
    const { artistId, requestIds } = await setup();
    const [first, second] = requestIds;
    await prisma.timeSlot.create({
      data: {
        bookingRequestId: first,
        artistId,
        startTime: START,
        endTime: addMinutes(START, 120),
        status: "RELEASED",
      },
    });

    const result = await confirmTimeSlot({
      bookingRequestId: second,
      artistId,
      startTime: START,
      durationMinutes: 120,
    });

    expect(result.success).toBe(true);
  });
});
