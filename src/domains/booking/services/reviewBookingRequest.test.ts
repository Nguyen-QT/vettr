import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import { computeSlotRanges } from "@/domains/scheduling/services/computeSlotRanges";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";

import { reviewBookingRequest } from "./reviewBookingRequest";

vi.mock("@/domains/scheduling/services/computeSlotRanges", () => ({
  computeSlotRanges: vi.fn(),
}));
vi.mock("@/domains/scheduling/services/confirmTimeSlot", () => ({
  createBookedTimeSlots: vi.fn(),
  isSlotConflict: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): scheduling is mocked at its
// public contracts (single- vs. two-slot is driven by computeSlotRanges'
// stubbed range count; the 180-minute slot maths is scheduling's own test).
// The real "slot already booked -> status update rolls back" behaviour
// (double-booking) is a 28.3 integration-tier candidate; here the
// conflict translation and write gating are asserted.
describe("reviewBookingRequest", () => {
  const requestId = "request-1";
  const requestedStartTime = new Date("2026-12-01T11:00:00.000Z");
  const range = { startTime: requestedStartTime, endTime: requestedStartTime };

  beforeEach(() => {
    vi.mocked(computeSlotRanges).mockReset();
    vi.mocked(createBookedTimeSlots).mockReset();
    vi.mocked(isSlotConflict).mockReset();
  });

  function stubRequest(startTime: Date | null = requestedStartTime): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      artistId: "artist-1",
      requestedStartTime: startTime,
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
  }

  it("books the slot and approves atomically when the duration fits one slot", async () => {
    stubRequest();
    vi.mocked(computeSlotRanges).mockReturnValue([range] as never);

    const result = await reviewBookingRequest({
      bookingRequestId: requestId,
      durationMinutes: 90,
      estimatedPrice: 150,
    });

    expect(result).toMatchObject({ success: true, outcome: "APPROVED" });
    expect(computeSlotRanges).toHaveBeenCalledWith(requestedStartTime, 90);
    expect(createBookedTimeSlots).toHaveBeenCalledWith(prismaMock, {
      bookingRequestId: requestId,
      artistId: "artist-1",
      startTime: requestedStartTime,
      durationMinutes: 90,
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "APPROVED", estimatedPrice: 150 },
    });
  });

  it("stores the proposal and awaits confirmation, without allocating slots, when duration spills into a second slot", async () => {
    stubRequest();
    vi.mocked(computeSlotRanges).mockReturnValue([range, range] as never);

    const result = await reviewBookingRequest({
      bookingRequestId: requestId,
      durationMinutes: 300,
      estimatedPrice: 400,
    });

    expect(result).toMatchObject({
      success: true,
      outcome: "AWAITING_SLOT_CONFIRMATION",
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: {
        status: "AWAITING_SLOT_CONFIRMATION",
        proposedDurationMinutes: 300,
        estimatedPrice: 400,
      },
    });
    // No allocation yet -- that's confirmProposedBooking's job (4.1g).
    expect(createBookedTimeSlots).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns an error for an unknown booking request", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await reviewBookingRequest({
      bookingRequestId: "missing",
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result.success).toBe(false);
    expect(computeSlotRanges).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("returns an error when the request has no requestedStartTime on file", async () => {
    stubRequest(null);

    const result = await reviewBookingRequest({
      bookingRequestId: requestId,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result).toEqual({
      success: false,
      error: "This request has no requested time on file.",
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("returns the slot-conflict error and does not approve when the slot is already booked", async () => {
    stubRequest();
    vi.mocked(computeSlotRanges).mockReturnValue([range] as never);
    const conflict = new Error("slot taken");
    vi.mocked(createBookedTimeSlots).mockRejectedValue(conflict);
    vi.mocked(isSlotConflict).mockReturnValue(true);

    const result = await reviewBookingRequest({
      bookingRequestId: requestId,
      durationMinutes: 60,
      estimatedPrice: 100,
    });

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });
    expect(isSlotConflict).toHaveBeenCalledWith(conflict);
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rethrows an error that is not a slot conflict", async () => {
    stubRequest();
    vi.mocked(computeSlotRanges).mockReturnValue([range] as never);
    vi.mocked(createBookedTimeSlots).mockRejectedValue(new Error("db down"));
    vi.mocked(isSlotConflict).mockReturnValue(false);

    await expect(
      reviewBookingRequest({
        bookingRequestId: requestId,
        durationMinutes: 60,
        estimatedPrice: 100,
      })
    ).rejects.toThrow("db down");
  });
});
