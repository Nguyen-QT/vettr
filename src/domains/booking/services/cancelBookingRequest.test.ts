import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { cancelBookingRequest } from "./cancelBookingRequest";

vi.mock("@/domains/billing/services/refundDeposit", () => ({
  refundDeposit: vi.fn(),
}));
vi.mock("@/domains/scheduling/services/releaseBookedTimeSlots", () => ({
  releaseBookedTimeSlots: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): billing's refundDeposit and
// scheduling's releaseBookedTimeSlots are mocked at their public contracts
// (the Stripe call itself is covered by billing's own tests). Slot status
// flipping to RELEASED and the transaction's all-or-nothing rollback are
// real-DB behaviours -> 28.3 integration-tier candidates.
describe("cancelBookingRequest", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const hour = 60 * 60_000;
  const clientId = "client-1";
  const requestId = "request-1";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(refundDeposit).mockReset();
    vi.mocked(releaseBookedTimeSlots).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function stubRequest(
    status: string,
    options: { slotStarts?: Date[]; depositPaid?: boolean; clientId?: string } = {}
  ): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      clientId: options.clientId ?? clientId,
      status,
      depositPaid: options.depositPaid ?? false,
      timeSlots: (options.slotStarts ?? []).map((startTime) => ({
        startTime,
        endTime: new Date(startTime.getTime() + hour),
      })),
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);
    prismaMock.clientProfile.update.mockResolvedValue({
      cancellationCount: 1,
    } as never);
  }

  const farFuture = () => new Date(now.getTime() + 30 * 24 * hour);
  const call = () =>
    cancelBookingRequest({ bookingRequestId: requestId, clientProfileId: clientId });

  it("cancels a PENDING request with no locked slot", async () => {
    stubRequest("PENDING");

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith({
      where: { id: requestId },
      include: { timeSlots: true },
    });
    expect(releaseBookedTimeSlots).toHaveBeenCalledWith(prismaMock, requestId);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "CANCELLED_BY_CLIENT" },
    });
  });

  it("does not apply a cancellation strike for a PENDING cancellation", async () => {
    stubRequest("PENDING");

    await call();

    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
  });

  it("cancels an APPROVED request outside the window and releases its slot", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(releaseBookedTimeSlots).toHaveBeenCalledWith(prismaMock, requestId);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "CANCELLED_BY_CLIENT" },
    });
  });

  it("refunds a paid deposit in full when cancelling an APPROVED request outside the window", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], depositPaid: true });
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith(requestId);
  });

  it("logs, but still reports success, when the deposit refund fails after the cancellation committed", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubRequest("APPROVED", { slotStarts: [farFuture()], depositPaid: true });
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: "stripe down",
    } as never);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalled();
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });

    await call();

    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("applies a cancellation strike and flags the client for an APPROVED cancellation", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });

    await call();

    expect(prismaMock.clientProfile.update).toHaveBeenNthCalledWith(1, {
      where: { id: clientId },
      data: { cancellationCount: { increment: 1 } },
    });
    expect(prismaMock.clientProfile.update).toHaveBeenNthCalledWith(2, {
      where: { id: clientId },
      data: { enforcePrecharge: true },
    });
  });

  it("rejects cancelling an APPROVED request inside the 48-hour window", async () => {
    stubRequest("APPROVED", {
      slotStarts: [new Date(now.getTime() + 10 * hour)],
      depositPaid: true,
    });

    const result = await call();

    expect(result).toEqual({
      success: false,
      error: CANCELLATION_WINDOW_ERROR_MESSAGE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("rejects a cancellation 1ms inside the 48-hour window but allows exactly 48 hours out", async () => {
    stubRequest("APPROVED", { slotStarts: [new Date(now.getTime() + 48 * hour - 1)] });
    expect((await call()).success).toBe(false);

    stubRequest("APPROVED", { slotStarts: [new Date(now.getTime() + 48 * hour)] });
    expect((await call()).success).toBe(true);
  });

  it("rejects cancelling an already-CANCELLED request", async () => {
    stubRequest("CANCELLED_BY_CLIENT");

    const result = await call();

    expect(result).toEqual({
      success: false,
      error: REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects cancelling a request that belongs to a different client", async () => {
    stubRequest("PENDING", { clientId: "someone-else" });

    const result = await call();

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await call();

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });
});
