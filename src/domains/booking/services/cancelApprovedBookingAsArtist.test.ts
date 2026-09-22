import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import type { RequestStatus } from "../types";
import { cancelApprovedBookingAsArtist } from "./cancelApprovedBookingAsArtist";

describe("cancelApprovedBookingAsArtist", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Artist Cancel Test Artist",
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

  it("cancels an APPROVED booking and releases its slot", async () => {
    const startTime = new Date("2099-06-10T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) },
    ]);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(updated?.status).toBe("CANCELLED_BY_ARTIST");
    expect(updated?.timeSlots[0]?.status).toBe("RELEASED");
  });

  it("never applies a cancellation strike to the client", async () => {
    const startTime = new Date("2099-06-11T11:00:00");
    const requestId = await createRequest("APPROVED", [
      { startTime, endTime: new Date(startTime.getTime() + 60 * 60_000) },
    ]);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    const client = await prisma.clientProfile.findUnique({ where: { id: clientId } });
    expect(client?.cancellationCount).toBe(0);
    expect(client?.enforcePrecharge).toBe(false);
  });

  it("rejects cancelling a request that is not APPROVED", async () => {
    const requestId = await createRequest("PENDING");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({
      success: false,
      error: "Only an approved booking can be cancelled.",
    });
  });

  it("rejects a request id that does not exist", async () => {
    const result = await cancelApprovedBookingAsArtist({
      bookingRequestId: randomUUID(),
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
  });
});
