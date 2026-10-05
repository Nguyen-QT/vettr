import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "../constants";
import { confirmTimeSlot, isSlotConflict } from "./confirmTimeSlot";

// Mocked-Prisma unit test (architecture.md §7). The no-double-booking
// guarantee itself lives in TimeSlot's GiST exclusion constraint, which a
// mock cannot prove. 28.3 integration-tier candidates handed off from here:
// exact-slot double booking, partial-overlap rejection, and the concurrent
// two-approval race (exactly one wins). Here we cover the service's own
// branches: slot-splitting payloads and conflict-vs-rethrow handling.
const EXCLUSION_ERROR = new Error(
  'conflicting key value violates exclusion constraint (code "23P01")'
);

describe("confirmTimeSlot", () => {
  const artistId = "artist-1";
  const bookingRequestId = "request-1";

  function stubCreateIds(ids: string[]): void {
    for (const id of ids) {
      prismaMock.timeSlot.create.mockResolvedValueOnce({ id } as never);
    }
  }

  it("books a single slot for a duration within the per-slot max", async () => {
    stubCreateIds(["slot-1"]);
    const startTime = new Date("2026-11-01T11:00:00.000Z");

    const result = await confirmTimeSlot({
      bookingRequestId,
      artistId,
      startTime,
      durationMinutes: 90,
    });

    expect(result).toEqual({ success: true, timeSlotIds: ["slot-1"] });
    expect(prismaMock.timeSlot.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.timeSlot.create).toHaveBeenCalledWith({
      data: {
        artistId,
        bookingRequestId,
        startTime,
        endTime: new Date("2026-11-01T12:30:00.000Z"),
        status: "BOOKED",
      },
    });
  });

  it("books two adjacent slots when duration overflows one slot", async () => {
    stubCreateIds(["slot-1", "slot-2"]);

    const result = await confirmTimeSlot({
      bookingRequestId,
      artistId,
      startTime: new Date("2026-11-02T11:00:00.000Z"),
      durationMinutes: 300, // exceeds the 180-minute per-slot max
    });

    expect(result).toEqual({ success: true, timeSlotIds: ["slot-1", "slot-2"] });
    expect(prismaMock.timeSlot.create).toHaveBeenCalledTimes(2);
    const [first, second] = prismaMock.timeSlot.create.mock.calls.map(
      ([args]) => args.data as { startTime: Date; endTime: Date; status: string }
    );
    expect(first.endTime).toEqual(second.startTime);
    expect(first.status).toBe("BOOKED");
    expect(second.status).toBe("BOOKED");
  });

  it("books adjacent, non-overlapping slots without any pre-check read", async () => {
    stubCreateIds(["slot-a"]);
    stubCreateIds(["slot-b"]);

    const first = await confirmTimeSlot({
      bookingRequestId: "request-a",
      artistId,
      startTime: new Date("2026-11-06T11:00:00.000Z"),
      durationMinutes: 60, // 11:00 - 12:00
    });
    const second = await confirmTimeSlot({
      bookingRequestId: "request-b",
      artistId,
      startTime: new Date("2026-11-06T12:00:00.000Z"), // starts exactly when first ends
      durationMinutes: 60,
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    // Correctness rests on the DB constraint, not an app-level
    // read-then-write check (architecture.md §8A).
    expect(prismaMock.timeSlot.findMany).not.toHaveBeenCalled();
    expect(prismaMock.timeSlot.findFirst).not.toHaveBeenCalled();
  });

  it("returns the slot-conflict error when the exclusion constraint rejects the insert", async () => {
    prismaMock.timeSlot.create.mockRejectedValueOnce(EXCLUSION_ERROR);

    const result = await confirmTimeSlot({
      bookingRequestId,
      artistId,
      startTime: new Date("2026-11-03T14:00:00.000Z"),
      durationMinutes: 60,
    });

    expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
  });

  it("returns the slot-conflict error when only the second slot of an overflow booking conflicts", async () => {
    stubCreateIds(["slot-1"]);
    prismaMock.timeSlot.create.mockRejectedValueOnce(EXCLUSION_ERROR);

    const result = await confirmTimeSlot({
      bookingRequestId,
      artistId,
      startTime: new Date("2026-11-04T11:00:00.000Z"),
      durationMinutes: 300,
    });

    expect(result).toEqual({ success: false, error: SLOT_CONFLICT_ERROR_MESSAGE });
  });

  it("rethrows errors that are not slot conflicts", async () => {
    const failure = new Error("connection reset");
    prismaMock.timeSlot.create.mockRejectedValueOnce(failure);

    await expect(
      confirmTimeSlot({
        bookingRequestId,
        artistId,
        startTime: new Date("2026-11-05T17:30:00.000Z"),
        durationMinutes: 60,
      })
    ).rejects.toBe(failure);
  });
});

describe("isSlotConflict", () => {
  it("is true for an error whose message carries the Postgres exclusion-violation code", () => {
    expect(isSlotConflict(EXCLUSION_ERROR)).toBe(true);
  });

  it("is false for other errors and non-Error values", () => {
    expect(isSlotConflict(new Error("something else"))).toBe(false);
    expect(isSlotConflict("23P01")).toBe(false);
    expect(isSlotConflict(null)).toBe(false);
  });
});
