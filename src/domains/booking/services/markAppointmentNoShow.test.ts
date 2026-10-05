import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { markAppointmentNoShow } from "./markAppointmentNoShow";

// Mocked-Prisma unit test (architecture.md §7), clock pinned.
// applyCancellationStrike is same-domain, so it runs for real against
// the mocked transaction client.
describe("markAppointmentNoShow", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const hour = 60 * 60_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function stubRequest(status: string, slotStarts: Date[] = []): void {
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

  it("marks a past-dated APPROVED appointment as a no-show and applies a strike", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() - 24 * hour)]);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
    prismaMock.clientProfile.update.mockResolvedValue({
      cancellationCount: 1,
    } as never);

    const result = await markAppointmentNoShow({ bookingRequestId: "request-1" });

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status: "NO_SHOW" },
    });
    expect(prismaMock.clientProfile.update).toHaveBeenNthCalledWith(1, {
      where: { id: "client-1" },
      data: { cancellationCount: { increment: 1 } },
    });
    expect(prismaMock.clientProfile.update).toHaveBeenNthCalledWith(2, {
      where: { id: "client-1" },
      data: { enforcePrecharge: true },
    });
  });

  it("leaves the TimeSlot BOOKED rather than releasing it", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() - 24 * hour)]);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
    prismaMock.clientProfile.update.mockResolvedValue({
      cancellationCount: 1,
    } as never);

    await markAppointmentNoShow({ bookingRequestId: "request-1" });

    expect(prismaMock.timeSlot.update).not.toHaveBeenCalled();
    expect(prismaMock.timeSlot.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.timeSlot.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects an appointment that hasn't happened yet", async () => {
    stubRequest("APPROVED", [new Date(now.getTime() + 24 * hour)]);

    const result = await markAppointmentNoShow({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: false,
      error: "This appointment hasn't happened yet.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a request that is not APPROVED", async () => {
    stubRequest("PENDING");

    const result = await markAppointmentNoShow({ bookingRequestId: "request-1" });

    expect(result).toEqual({
      success: false,
      error: "Only an approved appointment can be marked as a no-show.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await markAppointmentNoShow({ bookingRequestId: "missing" });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
