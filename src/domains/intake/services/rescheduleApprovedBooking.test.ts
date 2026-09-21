import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { RequestStatus } from "../types";
import { rescheduleApprovedBooking } from "./rescheduleApprovedBooking";

describe("rescheduleApprovedBooking", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Reschedule Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.timeSlot.deleteMany({ where: { artistId } });
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(
    status: RequestStatus,
    timeSlots: { startTime: Date; endTime: Date }[] = []
  ): Promise<string> {
    const request = await prisma.intakeRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
      },
    });
    for (const slot of timeSlots) {
      await prisma.timeSlot.create({
        data: {
          artistId,
          intakeRequestId: request.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "BOOKED",
        },
      });
    }
    return request.id;
  }

  it("moves a single-slot booking to a new time, releasing the old slot", async () => {
    const oldStart = new Date("2099-06-01T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime: oldStart, endTime: new Date(oldStart.getTime() + 60 * 60_000) },
    ]);
    const newStart = new Date("2099-06-02T14:00:00");

    const result = await rescheduleApprovedBooking({
      intakeRequestId: requestId,
      newStartTime: newStart,
      durationMinutes: 60,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(updated?.requestedStartTime).toEqual(newStart);
    const oldSlot = updated?.timeSlots.find(
      (slot) => slot.startTime.getTime() === oldStart.getTime()
    );
    const newSlot = updated?.timeSlots.find(
      (slot) => slot.startTime.getTime() === newStart.getTime()
    );
    expect(oldSlot?.status).toBe("RELEASED");
    expect(newSlot?.status).toBe("BOOKED");
  });

  it("books two adjacent slots when the duration spills over", async () => {
    const oldStart = new Date("2099-06-03T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime: oldStart, endTime: new Date(oldStart.getTime() + 60 * 60_000) },
    ]);
    const newStart = new Date("2099-06-04T11:00:00");

    const result = await rescheduleApprovedBooking({
      intakeRequestId: requestId,
      newStartTime: newStart,
      durationMinutes: 300,
    });

    expect(result).toEqual({ success: true });
    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    const bookedSlots = updated?.timeSlots.filter((slot) => slot.status === "BOOKED");
    expect(bookedSlots).toHaveLength(2);
  });

  it("rejects rescheduling to a time that conflicts with another booking", async () => {
    const conflictStart = new Date("2099-06-05T14:00:00");
    await createRequest("APPROVED", [
      {
        startTime: conflictStart,
        endTime: new Date(conflictStart.getTime() + 60 * 60_000),
      },
    ]);
    const oldStart = new Date("2099-06-05T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime: oldStart, endTime: new Date(oldStart.getTime() + 60 * 60_000) },
    ]);

    const result = await rescheduleApprovedBooking({
      intakeRequestId: requestId,
      newStartTime: conflictStart,
      durationMinutes: 60,
    });

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });

    const updated = await prisma.intakeRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    // Rolled back entirely -- the original slot is still BOOKED, not
    // left RELEASED with nothing to replace it.
    expect(updated?.timeSlots[0]?.status).toBe("BOOKED");
    expect(updated?.requestedStartTime).toBeNull();
  });

  it("rejects rescheduling a request that is not APPROVED", async () => {
    const requestId = await createRequest("PENDING");

    const result = await rescheduleApprovedBooking({
      intakeRequestId: requestId,
      newStartTime: new Date("2099-06-06T11:00:00"),
      durationMinutes: 60,
    });

    expect(result).toEqual({
      success: false,
      error: "Only an approved booking can be rescheduled.",
    });
  });

  it("rejects a request id that does not exist", async () => {
    const result = await rescheduleApprovedBooking({
      intakeRequestId: randomUUID(),
      newStartTime: new Date("2099-06-06T11:00:00"),
      durationMinutes: 60,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
