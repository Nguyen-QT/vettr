import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { confirmTimeSlot } from "./confirmTimeSlot";

// Hits the real local Postgres database (same as e2e/global-setup.ts) so
// the exclusion constraint's concurrency guarantee is actually exercised
// -- a mocked Prisma client couldn't prove a race condition is safe.
describe("confirmTimeSlot", () => {
  let artistId: string;

  beforeEach(async () => {
    artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "E2E Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
  });

  afterEach(async () => {
    // Cascades to TimeSlot/DesignReference/Addon rows.
    await prisma.intakeRequest.deleteMany({ where: { artistId } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  async function createIntakeRequest(): Promise<string> {
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
      },
    });
    return request.id;
  }

  it("books a single slot for a duration within the per-slot max", async () => {
    const intakeRequestId = await createIntakeRequest();

    const result = await confirmTimeSlot({
      intakeRequestId,
      artistId,
      startTime: new Date("2026-11-01T11:00:00.000Z"),
      durationMinutes: 90,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.timeSlotIds).toHaveLength(1);

    const slot = await prisma.timeSlot.findUnique({
      where: { id: result.timeSlotIds[0] },
    });
    expect(slot?.status).toBe("BOOKED");
  });

  it("books two adjacent slots and locks the second one when duration overflows one slot", async () => {
    const intakeRequestId = await createIntakeRequest();

    const result = await confirmTimeSlot({
      intakeRequestId,
      artistId,
      startTime: new Date("2026-11-02T11:00:00.000Z"),
      durationMinutes: 300, // exceeds the 180-minute per-slot max
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.timeSlotIds).toHaveLength(2);

    const slots = await prisma.timeSlot.findMany({
      where: { id: { in: result.timeSlotIds } },
      orderBy: { startTime: "asc" },
    });
    expect(slots.every((slot) => slot.status === "BOOKED")).toBe(true);
    expect(slots[0].endTime).toEqual(slots[1].startTime);
  });

  it("rejects a double-booking attempt against an already-booked slot", async () => {
    const firstRequestId = await createIntakeRequest();
    const secondRequestId = await createIntakeRequest();
    const startTime = new Date("2026-11-03T14:00:00.000Z");

    const first = await confirmTimeSlot({
      intakeRequestId: firstRequestId,
      artistId,
      startTime,
      durationMinutes: 60,
    });
    expect(first.success).toBe(true);

    const second = await confirmTimeSlot({
      intakeRequestId: secondRequestId,
      artistId,
      startTime,
      durationMinutes: 60,
    });

    expect(second.success).toBe(false);
    if (second.success) return;
    expect(second.error).toMatch(/already booked/i);
  });

  it("rejects a booking that only partially overlaps an already-booked slot", async () => {
    const firstRequestId = await createIntakeRequest();
    const secondRequestId = await createIntakeRequest();

    const first = await confirmTimeSlot({
      intakeRequestId: firstRequestId,
      artistId,
      startTime: new Date("2026-11-04T11:00:00.000Z"),
      durationMinutes: 120, // 11:00 - 13:00
    });
    expect(first.success).toBe(true);

    const second = await confirmTimeSlot({
      intakeRequestId: secondRequestId,
      artistId,
      startTime: new Date("2026-11-04T12:00:00.000Z"), // overlaps 12:00 - 13:00
      durationMinutes: 60,
    });

    expect(second.success).toBe(false);
  });

  it("allows two concurrently-submitted approvals for the same slot to race, letting exactly one win", async () => {
    const firstRequestId = await createIntakeRequest();
    const secondRequestId = await createIntakeRequest();
    const startTime = new Date("2026-11-05T17:30:00.000Z");

    const [first, second] = await Promise.all([
      confirmTimeSlot({
        intakeRequestId: firstRequestId,
        artistId,
        startTime,
        durationMinutes: 60,
      }),
      confirmTimeSlot({
        intakeRequestId: secondRequestId,
        artistId,
        startTime,
        durationMinutes: 60,
      }),
    ]);

    const successes = [first, second].filter((result) => result.success);
    const failures = [first, second].filter((result) => !result.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it("does not block adjacent, non-overlapping slots for the same artist", async () => {
    const firstRequestId = await createIntakeRequest();
    const secondRequestId = await createIntakeRequest();

    const first = await confirmTimeSlot({
      intakeRequestId: firstRequestId,
      artistId,
      startTime: new Date("2026-11-06T11:00:00.000Z"),
      durationMinutes: 60, // 11:00 - 12:00
    });
    expect(first.success).toBe(true);

    const second = await confirmTimeSlot({
      intakeRequestId: secondRequestId,
      artistId,
      startTime: new Date("2026-11-06T12:00:00.000Z"), // starts exactly when the first ends
      durationMinutes: 60,
    });

    expect(second.success).toBe(true);
  });
});
