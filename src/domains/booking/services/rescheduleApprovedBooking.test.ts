import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SLOT_CONFLICT_ERROR_MESSAGE } from "@/domains/scheduling/constants";
import {
  createBookedTimeSlots,
  isSlotConflict,
} from "@/domains/scheduling/services/confirmTimeSlot";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { rescheduleApprovedBooking } from "./rescheduleApprovedBooking";

vi.mock("@/domains/scheduling/services/confirmTimeSlot", () => ({
  createBookedTimeSlots: vi.fn(),
  isSlotConflict: vi.fn(),
}));
vi.mock("@/domains/scheduling/services/releaseBookedTimeSlots", () => ({
  releaseBookedTimeSlots: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): scheduling's slot services
// are mocked at their public contracts. Slot overlap/double-booking
// enforcement (the BOOKED-only exclusion constraint), adjacent-slot
// overflow capping, and "conflict rolls the release back so the request is
// never left slotless" are real-DB behaviours -> 28.3 integration-tier
// candidates; here the call ordering and payloads are asserted.
describe("rescheduleApprovedBooking", () => {
  const requestId = "request-1";
  const newStartTime = new Date("2099-09-01T14:00:00.000Z");

  beforeEach(() => {
    vi.mocked(createBookedTimeSlots).mockReset();
    vi.mocked(isSlotConflict).mockReset();
    vi.mocked(releaseBookedTimeSlots).mockReset();
  });

  function stubRequest(status = "APPROVED"): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      artistId: "artist-1",
      status,
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
  }

  it("moves a single-slot booking to a new time, releasing the old slot first", async () => {
    stubRequest();
    const order: string[] = [];
    vi.mocked(releaseBookedTimeSlots).mockImplementation(async () => {
      order.push("release");
    });
    vi.mocked(createBookedTimeSlots).mockImplementation(async () => {
      order.push("create");
      return undefined as never;
    });

    const result = await rescheduleApprovedBooking({
      bookingRequestId: requestId,
      newStartTime,
      durationMinutes: 60,
    });

    expect(result).toEqual({ success: true });
    expect(order).toEqual(["release", "create"]);
    expect(releaseBookedTimeSlots).toHaveBeenCalledWith(prismaMock, requestId);
    expect(createBookedTimeSlots).toHaveBeenCalledWith(prismaMock, {
      bookingRequestId: requestId,
      artistId: "artist-1",
      startTime: newStartTime,
      durationMinutes: 60,
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { requestedStartTime: newStartTime },
    });
  });

  it("passes a spill-over duration through to the slot booking so two adjacent slots can be booked", async () => {
    stubRequest();

    const result = await rescheduleApprovedBooking({
      bookingRequestId: requestId,
      newStartTime,
      durationMinutes: 300,
    });

    expect(result).toEqual({ success: true });
    expect(createBookedTimeSlots).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ durationMinutes: 300 })
    );
  });

  it("rejects rescheduling to a time that conflicts with another booking, without updating the request", async () => {
    stubRequest();
    const conflict = new Error("slot taken");
    vi.mocked(createBookedTimeSlots).mockRejectedValue(conflict);
    vi.mocked(isSlotConflict).mockReturnValue(true);

    const result = await rescheduleApprovedBooking({
      bookingRequestId: requestId,
      newStartTime,
      durationMinutes: 60,
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
    vi.mocked(createBookedTimeSlots).mockRejectedValue(new Error("db down"));
    vi.mocked(isSlotConflict).mockReturnValue(false);

    await expect(
      rescheduleApprovedBooking({
        bookingRequestId: requestId,
        newStartTime,
        durationMinutes: 60,
      })
    ).rejects.toThrow("db down");
  });

  it("rejects rescheduling a request that is not APPROVED", async () => {
    stubRequest("PENDING");

    const result = await rescheduleApprovedBooking({
      bookingRequestId: requestId,
      newStartTime,
      durationMinutes: 60,
    });

    expect(result).toEqual({
      success: false,
      error: "Only an approved booking can be rescheduled.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await rescheduleApprovedBooking({
      bookingRequestId: "missing",
      newStartTime,
      durationMinutes: 60,
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
