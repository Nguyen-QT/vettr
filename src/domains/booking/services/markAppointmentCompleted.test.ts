import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { markAppointmentCompleted } from "./markAppointmentCompleted";

// Mocked-Prisma unit test (architecture.md §7), clock pinned.
describe("markAppointmentCompleted", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const hour = 60 * 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function stubRequest(
    status: string,
    slotStarts: Date[] = []
  ): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      clientId: "client-1",
      status,
      timeSlots: slotStarts.map((startTime) => ({
        startTime,
        endTime: new Date(startTime.getTime() + hour),
      })),
    } as never);
  }

  it("marks a past-dated APPROVED appointment as completed", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() - 24 * hour)]);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    const result = await markAppointmentCompleted({ bookingRequestId: "request-1" });

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith({
      where: { id: "request-1" },
      include: { timeSlots: { where: { status: "BOOKED" } } },
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "COMPLETED" },
    });
  });

  it("never applies a cancellation strike", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() - 24 * hour)]);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    await markAppointmentCompleted({ bookingRequestId: "request-1" });

    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
  });

  it("rejects an appointment that hasn't happened yet", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() + 24 * hour)]);

    const result = await markAppointmentCompleted({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: false,
      error: "This appointment hasn't happened yet.",
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("treats a slot starting exactly now as not yet due", async () => {
    stubRequest("APPROVED", [now]);

    const result = await markAppointmentCompleted({ bookingRequestId: "request-1" });

    expect(result.success).toBe(false);
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request that is not APPROVED", async () => {
    stubRequest("PENDING");

    const result = await markAppointmentCompleted({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: false,
      error: "Only an approved appointment can be marked as completed.",
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await markAppointmentCompleted({ bookingRequestId: "missing" });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });
});
