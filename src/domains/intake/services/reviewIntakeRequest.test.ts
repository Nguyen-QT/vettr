import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { reviewIntakeRequest } from "./reviewIntakeRequest";

// Hits the real local Postgres database, same as
// scheduling/services/confirmTimeSlot.test.ts -- this service's whole
// job is composing confirmTimeSlot's transaction with an IntakeRequest
// status update, so a mocked client couldn't prove that composition is
// actually atomic.
describe("reviewIntakeRequest", () => {
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
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createIntakeRequest(
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
    const request = await prisma.intakeRequest.create({
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
    const intakeRequestId = await createIntakeRequest(
      new Date("2026-12-01T11:00:00.000Z")
    );

    const result = await reviewIntakeRequest({
      intakeRequestId,
      durationMinutes: 90,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("APPROVED");

    const request = await prisma.intakeRequest.findUniqueOrThrow({
      where: { id: intakeRequestId },
    });
    expect(request.status).toBe("APPROVED");

    const slots = await prisma.timeSlot.findMany({
      where: { intakeRequestId },
    });
    expect(slots).toHaveLength(1);
    expect(slots[0].status).toBe("BOOKED");
  });

  it("stores the proposal and awaits confirmation when duration spills into a second slot", async () => {
    const intakeRequestId = await createIntakeRequest(
      new Date("2026-12-02T11:00:00.000Z")
    );

    const result = await reviewIntakeRequest({
      intakeRequestId,
      durationMinutes: 300, // exceeds the 180-minute per-slot max
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outcome).toBe("AWAITING_SLOT_CONFIRMATION");

    const request = await prisma.intakeRequest.findUniqueOrThrow({
      where: { id: intakeRequestId },
    });
    expect(request.status).toBe("AWAITING_SLOT_CONFIRMATION");
    expect(request.proposedDurationMinutes).toBe(300);

    // No allocation yet -- that's confirmProposedBooking's job (4.1g).
    const slots = await prisma.timeSlot.findMany({
      where: { intakeRequestId },
    });
    expect(slots).toHaveLength(0);
  });

  it("returns an error for an unknown intake request", async () => {
    const result = await reviewIntakeRequest({
      intakeRequestId: randomUUID(),
      durationMinutes: 60,
    });

    expect(result.success).toBe(false);
  });

  it("returns an error when the request has no requestedStartTime on file", async () => {
    const intakeRequestId = await createIntakeRequest(null);

    const result = await reviewIntakeRequest({
      intakeRequestId,
      durationMinutes: 60,
    });

    expect(result.success).toBe(false);
  });

  it("rolls back the status update when the slot is already booked", async () => {
    const bookedRequestId = await createIntakeRequest(
      new Date("2026-12-03T14:00:00.000Z")
    );
    await reviewIntakeRequest({
      intakeRequestId: bookedRequestId,
      durationMinutes: 60,
    });

    const conflictingRequestId = await createIntakeRequest(
      new Date("2026-12-03T14:00:00.000Z")
    );
    const result = await reviewIntakeRequest({
      intakeRequestId: conflictingRequestId,
      durationMinutes: 60,
    });

    expect(result.success).toBe(false);

    const request = await prisma.intakeRequest.findUniqueOrThrow({
      where: { id: conflictingRequestId },
    });
    // Status must stay PENDING -- the transaction rolled back, it did
    // not partially apply the APPROVED status without a booked slot.
    expect(request.status).toBe("PENDING");

    const slots = await prisma.timeSlot.findMany({
      where: { intakeRequestId: conflictingRequestId },
    });
    expect(slots).toHaveLength(0);
  });
});
