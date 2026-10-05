import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { prisma } from "@/lib/prisma";
import { createBookingRequest, createIntegrationTracker } from "@/testUtils/integrationDb";

import { confirmProposedBooking } from "./confirmProposedBooking";
import { reviewBookingRequest } from "./reviewBookingRequest";

// Real-database booking tests (28.3.2.4): the double-booking, overflow-cap
// and rollback guarantees the mocked unit tier cannot prove -- they rest on
// TimeSlot's GiST exclusion constraint and real $transaction semantics.
const tracker = createIntegrationTracker();

const MINUTE_MS = 60_000;

// Far-future start; each test also uses its own artist so slots never collide.
function futureStart(): Date {
  return new Date("2040-01-01T11:00:00.000Z");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

async function setup(): Promise<{ artistId: string; clientId: string }> {
  const artist = await tracker.createArtist();
  const client = await tracker.createClientProfile();
  return { artistId: artist.id, clientId: client.id };
}

describe("booking integration", () => {
  beforeEach(async () => {
    await tracker.wipe();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  it("two requests approved concurrently for the same slot yield one winner and a handled loser", async () => {
    const { artistId, clientId } = await setup();
    const start = futureStart();
    const a = await createBookingRequest({ artistId, clientId, requestedStartTime: start });
    const b = await createBookingRequest({ artistId, clientId, requestedStartTime: start });

    const results = await Promise.all([
      reviewBookingRequest({ bookingRequestId: a.id, durationMinutes: 120, estimatedPrice: 200 }),
      reviewBookingRequest({ bookingRequestId: b.id, durationMinutes: 120, estimatedPrice: 200 }),
    ]);

    const winners = results.filter((r) => r.success);
    const losers = results.filter((r) => !r.success);
    expect(winners).toHaveLength(1);
    expect(losers).toEqual([{ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE }]);

    const slots = await prisma.timeSlot.findMany({ where: { artistId, status: "BOOKED" } });
    expect(slots).toHaveLength(1);

    // The loser's transaction rolled back: still PENDING, no price written.
    const requests = await prisma.bookingRequest.findMany({
      where: { id: { in: [a.id, b.id] } },
    });
    expect(requests.filter((r) => r.status === "APPROVED")).toHaveLength(1);
    const loser = requests.find((r) => r.status !== "APPROVED");
    expect(loser?.status).toBe("PENDING");
    expect(loser?.estimatedPrice).toBeNull();
  });

  it("a duration over one slot only proposes, then confirming books exactly two adjacent slots", async () => {
    const { artistId, clientId } = await setup();
    const start = futureStart();
    const request = await createBookingRequest({ artistId, clientId, requestedStartTime: start });

    const review = await reviewBookingRequest({
      bookingRequestId: request.id,
      durationMinutes: 300,
      estimatedPrice: 400,
    });
    expect(review).toMatchObject({ success: true, outcome: "AWAITING_SLOT_CONFIRMATION" });
    expect(await prisma.timeSlot.count({ where: { artistId } })).toBe(0);

    const confirm = await confirmProposedBooking(request.id);
    expect(confirm.success).toBe(true);

    const slots = await prisma.timeSlot.findMany({
      where: { artistId },
      orderBy: { startTime: "asc" },
    });
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.status)).toEqual(["BOOKED", "BOOKED"]);
    expect(slots[0].startTime).toEqual(start);
    expect(slots[0].endTime).toEqual(addMinutes(start, 180));
    expect(slots[1].startTime).toEqual(addMinutes(start, 180));
    expect(slots[1].endTime).toEqual(addMinutes(start, 300));
  });

  it("the maximum 360-minute duration still caps at two slots", async () => {
    const { artistId, clientId } = await setup();
    const request = await createBookingRequest({
      artistId,
      clientId,
      requestedStartTime: futureStart(),
    });

    await reviewBookingRequest({
      bookingRequestId: request.id,
      durationMinutes: 360,
      estimatedPrice: 500,
    });
    await confirmProposedBooking(request.id);

    expect(await prisma.timeSlot.count({ where: { artistId } })).toBe(2);
  });

  it("the overflow slot blocks a request starting in the adjacent slot", async () => {
    const { artistId, clientId } = await setup();
    const start = futureStart();
    const first = await createBookingRequest({ artistId, clientId, requestedStartTime: start });
    await reviewBookingRequest({
      bookingRequestId: first.id,
      durationMinutes: 300,
      estimatedPrice: 400,
    });
    await confirmProposedBooking(first.id);

    const adjacent = await createBookingRequest({
      artistId,
      clientId,
      requestedStartTime: addMinutes(start, 180),
    });
    const result = await reviewBookingRequest({
      bookingRequestId: adjacent.id,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
  });

  it("a conflict on the second overflow slot rolls back the first slot and the approval", async () => {
    const { artistId, clientId } = await setup();
    const start = futureStart();

    // Blocker occupies the would-be second slot [start+180, start+300].
    const blocker = await createBookingRequest({
      artistId,
      clientId,
      requestedStartTime: addMinutes(start, 180),
    });
    await reviewBookingRequest({
      bookingRequestId: blocker.id,
      durationMinutes: 120,
      estimatedPrice: 100,
    });

    const proposed = await createBookingRequest({
      artistId,
      clientId,
      requestedStartTime: start,
      status: "AWAITING_SLOT_CONFIRMATION",
      proposedDurationMinutes: 300,
    });
    const result = await confirmProposedBooking(proposed.id);

    expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
    // Slot 1 was created inside the transaction before slot 2 failed.
    expect(await prisma.timeSlot.count({ where: { bookingRequestId: proposed.id } })).toBe(0);
    const after = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: proposed.id } });
    expect(after.status).toBe("AWAITING_SLOT_CONFIRMATION");
  });

  describe("bookingRequest relations", () => {
    it("deleting a request cascades to its design references, addons and time slots", async () => {
      const { artistId, clientId } = await setup();
      const request = await createBookingRequest({
        artistId,
        clientId,
        requestedStartTime: futureStart(),
      });
      await prisma.designReference.create({
        data: { bookingRequestId: request.id, imageUrl: "https://example.com/ref.png" },
      });
      await prisma.addon.create({
        data: { bookingRequestId: request.id, label: "Colour", price: 25 },
      });
      await prisma.timeSlot.create({
        data: {
          bookingRequestId: request.id,
          artistId,
          startTime: futureStart(),
          endTime: addMinutes(futureStart(), 60),
          status: "BOOKED",
        },
      });

      await prisma.bookingRequest.delete({ where: { id: request.id } });

      expect(await prisma.designReference.count({ where: { bookingRequestId: request.id } })).toBe(0);
      expect(await prisma.addon.count({ where: { bookingRequestId: request.id } })).toBe(0);
      expect(await prisma.timeSlot.count({ where: { bookingRequestId: request.id } })).toBe(0);
    });

    it("an artist or client that still has a request cannot be deleted", async () => {
      const { artistId, clientId } = await setup();
      await createBookingRequest({ artistId, clientId });

      await expect(prisma.artist.delete({ where: { id: artistId } })).rejects.toThrow();
      await expect(prisma.clientProfile.delete({ where: { id: clientId } })).rejects.toThrow();
      expect(await prisma.bookingRequest.count({ where: { artistId } })).toBe(1);
    });
  });
});
