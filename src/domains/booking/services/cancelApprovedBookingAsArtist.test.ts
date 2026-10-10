import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { cancelApprovedBookingAsArtist } from "./cancelApprovedBookingAsArtist";

vi.mock("@/domains/billing/services/refundDeposit", () => ({
  refundDeposit: vi.fn(),
}));
vi.mock("@/domains/scheduling/services/releaseBookedTimeSlots", () => ({
  releaseBookedTimeSlots: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): billing and scheduling are
// mocked at their public contracts. Real RELEASED slot state is a 28.3
// integration-tier candidate.
describe("cancelApprovedBookingAsArtist", () => {
  const requestId = "request-1";

  beforeEach(() => {
    vi.mocked(refundDeposit).mockReset();
    vi.mocked(releaseBookedTimeSlots).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubRequest(status: string, depositPaid = false): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      status,
      depositPaid,
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({ depositPaid } as never);
  }

  it("cancels an APPROVED booking and releases its slot", async () => {
    stubRequest("APPROVED");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(releaseBookedTimeSlots).toHaveBeenCalledWith(prismaMock, requestId);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "CANCELLED_BY_ARTIST" },
      select: { depositPaid: true },
    });
  });

  it("refunds a paid deposit in full", async () => {
    stubRequest("APPROVED", true);
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith(requestId);
  });

  it("refunds a deposit paid after the pre-read, from the status update's own read-back", async () => {
    stubRequest("APPROVED");
    prismaMock.bookingRequest.update.mockResolvedValue({ depositPaid: true } as never);
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith(requestId);
  });

  it("logs, but still reports success, when the deposit refund fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubRequest("APPROVED", true);
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: "stripe down",
    } as never);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    stubRequest("APPROVED");

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("never applies a cancellation strike to the client", async () => {
    stubRequest("APPROVED");

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
  });

  it("rejects cancelling a request that is not APPROVED", async () => {
    stubRequest("PENDING");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({
      success: false,
      error: "Only an approved booking can be cancelled.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: "missing" });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
