import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";

import { cancelDepositPaymentIntent } from "@/domains/billing/services/cancelDepositPaymentIntent";
import { insertDepositRefundIntent } from "@/domains/billing/services/insertDepositRefundIntent";
import { refundDeposit } from "@/domains/billing/services/refundDeposit";
import { releaseBookedTimeSlots } from "@/domains/scheduling/services/releaseBookedTimeSlots";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import {
  CANCELLATION_WINDOW_ERROR_MESSAGE,
  REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE,
  REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { cancelBookingRequest } from "./cancelBookingRequest";

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

// Mocked-Prisma unit test (architecture.md §7): billing's refundDeposit,
// insertDepositRefundIntent and cancelDepositPaymentIntent and scheduling's
// releaseBookedTimeSlots are mocked at their public contracts (the Stripe
// calls and the intent insert are covered by billing's own tests). Slot
// status flipping to RELEASED and the transaction's all-or-nothing rollback
// are real-DB behaviours -> 28.3 integration-tier candidates.
describe("cancelBookingRequest", () => {
  const now = new Date("2026-10-05T12:00:00.000Z");
  const hour = 60 * 60_000;
  const clientId = "client-1";
  const requestId = "request-1";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(refundDeposit).mockReset();
    vi.mocked(insertDepositRefundIntent).mockReset();
    vi.mocked(insertDepositRefundIntent).mockResolvedValue(undefined);
    vi.mocked(cancelDepositPaymentIntent).mockReset();
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(true);
    vi.mocked(releaseBookedTimeSlots).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function stubRequest(
    status: string,
    options: {
      slotStarts?: Date[];
      depositPaid?: boolean;
      stripePaymentIntentId?: string;
      clientId?: string;
    } = {}
  ): void {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: requestId,
      clientId: options.clientId ?? clientId,
      status,
      depositPaid: options.depositPaid ?? false,
      stripePaymentIntentId: options.stripePaymentIntentId ?? null,
      timeSlots: (options.slotStarts ?? []).map((startTime) => ({
        startTime,
        endTime: new Date(startTime.getTime() + hour),
      })),
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({
      depositPaid: options.depositPaid ?? false,
      stripePaymentIntentId: options.stripePaymentIntentId ?? null,
    } as never);
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
      select: { depositPaid: true, stripePaymentIntentId: true },
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
      select: { depositPaid: true, stripePaymentIntentId: true },
    });
  });

  it("refunds a paid deposit in full when cancelling an APPROVED request outside the window", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], depositPaid: true });
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith(requestId);
  });

  it("refunds a deposit paid after the pre-read, from the status update's own read-back", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });
    prismaMock.bookingRequest.update.mockResolvedValue({ depositPaid: true } as never);
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith(requestId);
  });

  it("logs ids only, but still reports success, when the deposit refund fails after the cancellation committed", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    stubRequest("APPROVED", {
      slotStarts: [farFuture()],
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    });
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: "stripe down",
    } as never);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "cancelBookingRequest",
      reason: "deposit_refund_failed",
      severity: "warning",
      bookingRequestId: requestId,
      paymentIntentId: "pi_123",
    });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalled();
  });

  it("does not attempt a refund when the deposit was never paid", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });

    await call();

    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("records a paid deposit's refund intent through the cancel's transaction, before refunding", async () => {
    stubRequest("APPROVED", {
      slotStarts: [farFuture()],
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    });
    const txMock = mockDeep<Prisma.TransactionClient>();
    txMock.bookingRequest.update.mockResolvedValue({
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    } as never);
    txMock.clientProfile.update.mockResolvedValue({ cancellationCount: 1 } as never);
    prismaMock.$transaction.mockImplementationOnce(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await call();

    expect(insertDepositRefundIntent).toHaveBeenCalledTimes(1);
    expect(insertDepositRefundIntent).toHaveBeenCalledWith(expect.anything(), requestId, "pi_123");
    // Identity, not deep equality: two deep mocks compare equal.
    expect(vi.mocked(insertDepositRefundIntent).mock.calls[0]?.[0]).toBe(txMock);
    expect(vi.mocked(insertDepositRefundIntent).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refundDeposit).mock.invocationCallOrder[0]!
    );
  });

  it("records no refund intent for an unpaid booking with a PaymentIntent", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], stripePaymentIntentId: "pi_123" });

    await call();

    expect(insertDepositRefundIntent).not.toHaveBeenCalled();
  });

  it("records no refund intent for a paid deposit with no PaymentIntent", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], depositPaid: true });
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await call();

    expect(insertDepositRefundIntent).not.toHaveBeenCalled();
  });

  it("fails the cancellation, and never refunds, when the refund intent insert throws", async () => {
    stubRequest("APPROVED", {
      slotStarts: [farFuture()],
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    });
    vi.mocked(insertDepositRefundIntent).mockRejectedValue(new Error("db down"));

    await expect(call()).rejects.toThrow("db down");

    expect(refundDeposit).not.toHaveBeenCalled();
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("cancels an unpaid booking's stored PaymentIntent and does not refund", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], stripePaymentIntentId: "pi_123" });

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(cancelDepositPaymentIntent).toHaveBeenCalledTimes(1);
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_123");
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("refunds, and does not cancel, a paid booking's PaymentIntent", async () => {
    stubRequest("APPROVED", {
      slotStarts: [farFuture()],
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
    });
    vi.mocked(refundDeposit).mockResolvedValue({ success: true } as never);

    await call();

    expect(refundDeposit).toHaveBeenCalledWith(requestId);
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("neither refunds nor cancels when no PaymentIntent was stored", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()] });

    await call();

    expect(refundDeposit).not.toHaveBeenCalled();
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
  });

  it("cancels a PaymentIntent stored after the pre-read, from the status update's own read-back", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], stripePaymentIntentId: "pi_old" });
    prismaMock.bookingRequest.update.mockResolvedValue({
      depositPaid: false,
      stripePaymentIntentId: "pi_new",
    } as never);

    await call();

    expect(cancelDepositPaymentIntent).toHaveBeenCalledTimes(1);
    expect(cancelDepositPaymentIntent).toHaveBeenCalledWith("pi_new");
  });

  it("still reports success when the PaymentIntent cancel fails after the cancellation committed", async () => {
    stubRequest("APPROVED", { slotStarts: [farFuture()], stripePaymentIntentId: "pi_123" });
    vi.mocked(cancelDepositPaymentIntent).mockResolvedValue(false);

    const result = await call();

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalled();
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
    expect(cancelDepositPaymentIntent).not.toHaveBeenCalled();
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
