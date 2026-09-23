import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import type { RequestStatus } from "@/domains/booking/types";

import { finalizeCheckout } from "./finalizeCheckout";

// Hits the real local Postgres database, same as the rest of this
// suite's DB-backed tests.
describe("finalizeCheckout", () => {
  let artistId: string;
  let clientId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    clientId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Finalize Checkout Test Artist",
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
  ) {
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        status,
        estimatedPrice: 150,
      },
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
    return request;
  }

  it("marks a past-due APPROVED request owned by the artist as completed", async () => {
    const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
    const request = await createRequest("APPROVED", [
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
    ]);

    const result = await finalizeCheckout(request.id, artistId);

    expect(result).toEqual({ success: true });
    const updated = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    expect(updated?.status).toBe("COMPLETED");
  });

  it("rejects a request that does not belong to the artist", async () => {
    const pastStart = new Date(Date.now() - 24 * 60 * 60_000);
    const request = await createRequest("APPROVED", [
      { startTime: pastStart, endTime: new Date(pastStart.getTime() + 60 * 60_000) },
    ]);

    const result = await finalizeCheckout(request.id, randomUUID());

    expect(result.success).toBe(false);
    const updated = await prisma.bookingRequest.findUnique({ where: { id: request.id } });
    expect(updated?.status).toBe("APPROVED");
  });

  it("delegates the not-yet-due rejection to markAppointmentCompleted", async () => {
    const futureStart = new Date(Date.now() + 24 * 60 * 60_000);
    const request = await createRequest("APPROVED", [
      { startTime: futureStart, endTime: new Date(futureStart.getTime() + 60 * 60_000) },
    ]);

    const result = await finalizeCheckout(request.id, artistId);

    expect(result).toEqual({
      success: false,
      error: "This appointment hasn't happened yet.",
    });
  });

  it("rejects a request that doesn't exist", async () => {
    const result = await finalizeCheckout(randomUUID(), artistId);

    expect(result.success).toBe(false);
  });
});
