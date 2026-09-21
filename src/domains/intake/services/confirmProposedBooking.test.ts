import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { confirmProposedBooking } from "./confirmProposedBooking";
import { reviewIntakeRequest } from "./reviewIntakeRequest";

// Hits the real local Postgres database, same as reviewIntakeRequest.test.ts.
describe("confirmProposedBooking", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Confirm Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createIntakeRequest(requestedStartTime: Date): Promise<string> {
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
        requestedStartTime,
      },
    });
    return request.id;
  }

  it("books both proposed slots and approves an AWAITING_SLOT_CONFIRMATION request", async () => {
    const intakeRequestId = await createIntakeRequest(
      new Date("2026-12-10T11:00:00.000Z")
    );
    const proposal = await reviewIntakeRequest({
      intakeRequestId,
      durationMinutes: 300, // spills into a second slot
    });
    expect(proposal.success).toBe(true);
    if (!proposal.success) return;
    expect(proposal.outcome).toBe("AWAITING_SLOT_CONFIRMATION");

    const result = await confirmProposedBooking(intakeRequestId);

    expect(result.success).toBe(true);

    const request = await prisma.intakeRequest.findUniqueOrThrow({
      where: { id: intakeRequestId },
    });
    expect(request.status).toBe("APPROVED");

    const slots = await prisma.timeSlot.findMany({
      where: { intakeRequestId },
      orderBy: { startTime: "asc" },
    });
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.status === "BOOKED")).toBe(true);
    expect(slots[0].endTime).toEqual(slots[1].startTime);
  });

  it("returns an error for an unknown intake request", async () => {
    const result = await confirmProposedBooking(randomUUID());
    expect(result.success).toBe(false);
  });

  it("returns an error when the request is not AWAITING_SLOT_CONFIRMATION", async () => {
    const intakeRequestId = await createIntakeRequest(
      new Date("2026-12-11T11:00:00.000Z")
    );
    // Still PENDING -- never reviewed.

    const result = await confirmProposedBooking(intakeRequestId);

    expect(result.success).toBe(false);
  });

  it("rolls back when one of the two proposed slots was booked by someone else in the meantime", async () => {
    const intakeRequestId = await createIntakeRequest(
      new Date("2026-12-12T11:00:00.000Z")
    );
    const proposal = await reviewIntakeRequest({
      intakeRequestId,
      durationMinutes: 300,
    });
    expect(proposal.success).toBe(true);

    // Someone else takes the second slot's exact window in the meantime.
    const otherRequestId = await createIntakeRequest(
      new Date("2026-12-12T14:00:00.000Z")
    );
    const otherBooking = await reviewIntakeRequest({
      intakeRequestId: otherRequestId,
      durationMinutes: 60,
    });
    expect(otherBooking.success).toBe(true);

    const result = await confirmProposedBooking(intakeRequestId);

    expect(result.success).toBe(false);

    const request = await prisma.intakeRequest.findUniqueOrThrow({
      where: { id: intakeRequestId },
    });
    // Still awaiting -- the transaction rolled back, no partial booking.
    expect(request.status).toBe("AWAITING_SLOT_CONFIRMATION");

    const slots = await prisma.timeSlot.findMany({
      where: { intakeRequestId },
    });
    expect(slots).toHaveLength(0);
  });
});
