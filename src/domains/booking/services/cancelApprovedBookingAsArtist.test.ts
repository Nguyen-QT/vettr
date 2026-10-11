import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";

import { cancelDepositPaymentIntent } from "@/domains/billing/services/cancelDepositPaymentIntent";
import { insertDepositRefundIntent } from "@/domains/billing/services/insertDepositRefundIntent";
import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { cancelApprovedBookingAsArtist } from "./cancelApprovedBookingAsArtist";

vi.mock("@/domains/billing/services/cancelDepositPaymentIntent", () => ({
  cancelDepositPaymentIntent: vi.fn(),
}));
vi.mock("@/domains/billing/services/insertDepositRefundIntent", () => ({
  insertDepositRefundIntent: vi.fn(),
}));
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
    vi.mocked(insertDepositRefundIntent).mockReset();
    vi.mocked(insertDepositRefundIntent).mockResolvedValue(undefined);
    vi.mocked(cancelDepositPaymentIntent).mockReset();
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(true);
    vi.mocked(releaseBookedTimeSlots).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubRequest(
    status: string,
    depositPaid = false,
    stripePaymentIntentId: string | null = null
  ): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      status,
      depositPaid,
      stripePaymentIntentId,
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({
      depositPaid,
      stripePaymentIntentId,
    } as never);
  }

  it("cancels an APPROVED booking and releases its slot", async () => {
    stubRequest("APPROVED");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(releaseBookedTimeSlots).toHaveBeenCalledWith(prismaMock, requestId);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { status: "CANCELLED_BY_ARTIST" },
      select: { depositPaid: true, stripePaymentIntentId: true },
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

  it("logs ids only, but still reports success, when the deposit refund fails", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubRequest("APPROVED", true, "pi_123");
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: "stripe down",
    } as never);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "cancelApprovedBookingAsArtist",
      reason: "deposit_refund_failed",
      severity: "warning",
      bookingRequestId: requestId,
      paymentIntentId: "pi_123",
    });
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    stubRequest("APPROVED");

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("records a paid deposit's refund intent through the cancel's transaction, before refunding", async () => {
    stubRequest("APPROVED", true, "pi_123");
    const txMock = mockDeep<Prisma.TransactionClient>();
    txMock.bookingRequest.update.mockResolvedValue({
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    } as never);
    prismaMock.$transaction.mockImplementationOnce(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(insertDepositRefundIntent).toHaveBeenCalledTimes(1);
    expect(insertDepositRefundIntent).toHaveBeenCalledWith(expect.anything(), requestId, "pi_123");
    // Identity, not deep equality: two deep mocks compare equal.
    expect(vi.mocked(insertDepositRefundIntent).mock.calls[0]?.[0]).toBe(txMock);
    expect(vi.mocked(insertDepositRefundIntent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refundDeposit).mock.invocationCallOrder[0]!
    );
  });

  it("records no refund intent for an unpaid booking with a PaymentIntent", async () => {
    stubRequest("APPROVED", false, "pi_123");

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(insertDepositRefundIntent).not.toHaveBeenCalled();
  });

  it("records no refund intent for a paid deposit with no PaymentIntent", async () => {
    stubRequest("APPROVED", true);
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(insertDepositRefundIntent).not.toHaveBeenCalled();
  });

  it("fails the cancellation, and never refunds, when the refund intent insert throws", async () => {
    stubRequest("APPROVED", true, "pi_123");
    vi.mocked(insertDepositRefundIntent).mockRejectedValue(new Error("db down"));

    await expect(
      cancelApprovedBookingAsArtist({ bookingRequestId: requestId })
    ).rejects.toThrow("db down");

    expect(refundDeposit).not.toHaveBeenCalled();
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("cancels an unpaid booking's stored PaymentIntent and does not refund", async () => {
    stubRequest("APPROVED", false, "pi_123");

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
    expect(cancelDepositPaymentIntent).toHaveBeenCalledTimes(1);
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_123");
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("refunds, and does not cancel, a paid booking's PaymentIntent", async () => {
    stubRequest("APPROVED", true, "pi_123");
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(refundDeposit).toHaveBeenCalledWith(requestId);
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("neither refunds nor cancels when no PaymentIntent was stored", async () => {
    stubRequest("APPROVED");

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(refundDeposit).not.toHaveBeenCalled();
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("cancels a PaymentIntent stored after the pre-read, from the status update's own read-back", async () => {
    stubRequest("APPROVED", false, "pi_old");
    prismaMock.bookingRequest.update.mockResolvedValue({
      depositPaid: false,
      stripePaymentIntentId: "pi_new",
    } as never);

    await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(cancelDepositPaymentIntent).toHaveBeenCalledTimes(1);
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_new");
  });

  it("still reports success when the PaymentIntent cancel fails", async () => {
    stubRequest("APPROVED", false, "pi_123");
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(false);

    const result = await cancelApprovedBookingAsArtist({ bookingRequestId: requestId });

    expect(result).toEqual({ success: true });
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
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
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
