import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";

import { confirmProposedBooking } from "./confirmProposedBooking";

vi.mock("@/domains/scheduling/services/confirmTimeSlot", () => ({
  createBookedTimeSlots: vi.fn(),
  isSlotConflict: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): scheduling's slot booking
// is mocked at its public contract. The real "second slot taken by someone
// else -> transaction rolls back, no partial booking" behaviour (double-
// booking under concurrency) is a 28.3 integration-tier candidate; here
// only this service's conflict translation and write ordering are asserted.
describe("confirmProposedBooking", () => {
  const requestedStartTime = new Date("2026-12-10T11:00:00.000Z");

  function stubRequest(
    overrides: Partial<{
      status: string;
      requestedStartTime: Date | null;
      proposedDurationMinutes: number | null;
    }> = {}
  ): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      artistId: "artist-1",
      status: "AWAITING_SLOT_CONFIRMATION",
      requestedStartTime,
      proposedDurationMinutes: 300,
      ...overrides,
    } as never);
  }

  beforeEach(() => {
    vi.mocked(createBookedTimeSlots).mockReset();
    vi.mocked(isSlotConflict).mockReset();
  });

  it("books both proposed slots and approves an AWAITING_SLOT_CONFIRMATION request", async () => {
    stubRequest();
    vi.mocked(createBookedTimeSlots).mockResolvedValue(undefined as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    const result = await confirmProposedBooking("request-1");

    expect(result.success).toBe(true);
    expect(createBookedTimeSlots).toHaveBeenCalledWith(prismaMock, {
      bookingRequestId: "request-1",
      artistId: "artist-1",
      startTime: requestedStartTime,
      durationMinutes: 300,
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "APPROVED" },
    });
  });

  it("returns an error for an unknown booking request", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await confirmProposedBooking("missing");

    expect(result.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns an error when the request is not AWAITING_SLOT_CONFIRMATION", async () => {
    stubRequest({ status: "PENDING" });

    const result = await confirmProposedBooking("request-1");

    expect(result.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns an error when the request has no proposed booking on file", async () => {
    stubRequest({ proposedDurationMinutes: null });

    const result = await confirmProposedBooking("request-1");

    expect(result).toEqual({
      success: false,
      error: "This request has no proposed booking on file.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns the slot-conflict error and does not approve when a proposed slot was taken in the meantime", async () => {
    stubRequest();
    const conflict = new Error("slot taken");
    vi.mocked(createBookedTimeSlots).mockRejectedValue(conflict);
    vi.mocked(isSlotConflict).mockReturnValue(true);

    const result = await confirmProposedBooking("request-1");

    expect(result).toEqual({
      success: false,
      error: SLOT_CONFLICT_ERROR_MESSAGE,
    });
    expect(isSlotConflict).toHaveBeenCalledWith(conflict);
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rethrows an error that is not a slot conflict", async () => {
    stubRequest();
    vi.mocked(createBookedTimeSlots).mockRejectedValue(new Error("db down"));
    vi.mocked(isSlotConflict).mockReturnValue(false);

    await expect(confirmProposedBooking("request-1")).rejects.toThrow("db down");
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });
});
