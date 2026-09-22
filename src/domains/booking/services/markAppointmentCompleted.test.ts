import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { RequestStatus } from "../types";
import { markAppointmentCompleted } from "./markAppointmentCompleted";

describe("markAppointmentCompleted", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Completed Test Artist",
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
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.clientProfile.delete({ where: { id: clientId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createRequest(
    status: RequestStatus,
    timeSlots: { startTime: Date; endTime: Date }[] = []
  ): Promise<string> {
    const request = await prisma.bookingRequest.create({
      data: { clientId, artistId, tier: "TIER_2", minPrice: 100, maxPrice: 200, status },
    });
    for (const slot of timeSlots) {
      await prisma.timeSlot.create({
        data: {
          artistId,
          bookingRequestId: request.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: "BOOKED",
        },
      });
    }
    return request.id;
  }

  it("marks a past-dated APPROVED appointment as completed", async () => {
    const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
    ]);

    const result = await markAppointmentCompleted({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({ where: { id: requestId } });
    expect(updated?.status).toBe("COMPLETED");
  });

  it("never applies a cancellation strike", async () => {
    const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
    ]);

    await markAppointmentCompleted({ bookingRequestId: requestId });

    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    expect(client?.cancellationCount).toBe(0);
  });

  it("rejects an appointment that hasn't happened yet", async () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60_000);
    const requestId = await createRequest("APPROVED", [
      { startTime: futureStart, endTime: new Date(futureStart.getTime() + 60 * 60_000) },
    ]);

    const result = await markAppointmentCompleted({ bookingRequestId: requestId });

    expect(result).toEqual({
      success: false,
      error: "This appointment hasn't happened yet.",
    });
  });

  it("rejects a request that is not APPROVED", async () => {
    const requestId = await createRequest("PENDING");

    const result = await markAppointmentCompleted({ bookingRequestId: requestId });

    expect(result).toEqual({
      success: false,
      error: "Only an approved appointment can be marked as completed.",
    });
  });

  it("rejects a request id that does not exist", async () => {
    const result = await markAppointmentCompleted({ bookingRequestId: randomUUID() });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
