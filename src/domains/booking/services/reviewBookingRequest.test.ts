import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { reviewBookingRequest } from "./reviewBookingRequest";

// Hits the real local Postgres database, same as
// scheduling/services/confirmTimeSlot.test.ts -- this service's whole
// job is composing confirmTimeSlot's transaction with an BookingRequest
// status update, so a mocked client couldn't prove that composition is
// actually atomic.
describe("reviewBookingRequest", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Review Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.bookingRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createBookingRequest(
    requestedStartTime: Date | null
  ): Promise<string> {
    const clientId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientId,
        instagramHandle: `test_client_${clientId.slice(0, 8)}`,
        email: `test_client_${clientId.slice(0, 8)}@example.com`,
      },
    });
    const request = await prisma.bookingRequest.create({
      data: {
        clientId,
        artistId,
        tier: "TIER_2",
        minPrice: 100,
        maxPrice: 200,
        requestedStartTime: requestedStartTime ?? undefined,
      },
    });
    return request.id;
  }

  it("books the slot and approves when the duration fits one slot", async () => {
    const bookingRequestId = await createBookingRequest(
      new Date("2026-12-01T11:00:00.000Z")
    );

    const result = await reviewBookingRequest({
      bookingRequestId,
      durationMinutes: 90,
      estimatedPrice: 150,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("APPROVED");

    const request = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: bookingRequestId },
    });
    expect(request.status).toBe("APPROVED");
    expect(request.estimatedPrice?.toNumber()).toBe(150);

    const slots = await prisma.timeSlot.findMany({
      where: { bookingRequestId },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].status).toBe("BOOKED");
  });

  it("stores the proposal and awaits confirmation when duration spills into a second slot", async () => {
    const bookingRequestId = await createBookingRequest(
      new Date("2026-12-02T11:00:00.000Z")
    );

    const result = await reviewBookingRequest({
      bookingRequestId,
      durationMinutes: 300, // exceeds the 180-minute per-slot max
      estimatedPrice: 400,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("AWAITING_SLOT_CONFIRMATION");

    const request = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: bookingRequestId },
    });
    expect(request.status).toBe("AWAITING_SLOT_CONFIRMATION");
    expect(request.proposedDurationMinutes).toBe(300);
    expect(request.estimatedPrice?.toNumber()).toBe(400);

    // No allocation yet -- that's confirmProposedBooking's job (4.1g).
    const slots = await prisma.timeSlot.findMany({
      where: { bookingRequestId },
    });
    expect(slots).toHaveLength(0);
  });

  it("returns an error for an unknown booking request", async () => {
    const result = await reviewBookingRequest({
      bookingRequestId: randomUUID(),
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result.success).toBe(false);
  });

  it("returns an error when the request has no requestedStartTime on file", async () => {
    const bookingRequestId = await createBookingRequest(null);

    const result = await reviewBookingRequest({
      bookingRequestId,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result.success).toBe(false);
  });

  it("rolls back the status update when the slot is already booked", async () => {
    const bookedRequestId = await createBookingRequest(
      new Date("2026-12-03T14:00:00.000Z")
    );
    await reviewBookingRequest({
      bookingRequestId: bookedRequestId,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    const conflictingRequestId = await createBookingRequest(
      new Date("2026-12-03T14:00:00.000Z")
    );
    const result = await reviewBookingRequest({
      bookingRequestId: conflictingRequestId,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result.success).toBe(false);

    const request = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: conflictingRequestId },
    });
    // Status must stay PENDING -- the transaction rolled back, it did
    // not partially apply the APPROVED status without a booked slot.
    expect(request.status).toBe("PENDING");

    const slots = await prisma.timeSlot.findMany({
      where: { bookingRequestId: conflictingRequestId },
    });
    expect(slots).toHaveLength(0);
  });
});
