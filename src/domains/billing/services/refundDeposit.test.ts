import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositRefund } from "@/domains/booking/services/recordDepositRefund";
import type { BookingRequestDepositView } from "@/domains/booking/types";
import { Prisma } from "@/generated/prisma/client";

import {
  DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
  DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
  DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
  DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
} from "../constants";
import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";
import { recordDepositRefundIntent } from "./recordDepositRefundIntent";
import { refundDeposit } from "./refundDeposit";

const createRefundMock = vi.fn();

// vi.mock calls are hoisted above imports by vitest's transform, so
// this replaces the real Stripe client before refundDeposit above
// ever sees it.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    refunds: {
      create: (...args: unknown[]) => createRefundMock(...args),
    },
  },
}));
vi.mock("@/domains/booking/services/getBookingRequestForDeposit", () => ({
  getBookingRequestForDeposit: vi.fn(),
}));
vi.mock("@/domains/booking/services/recordDepositRefund", () => ({
  recordDepositRefund: vi.fn(),
}));
vi.mock("./recordDepositRefundIntent", () => ({
  recordDepositRefundIntent: vi.fn(),
}));
vi.mock("./advanceDepositRefundStatus", () => ({
  advanceDepositRefundStatus: vi.fn(),
}));

// Unit test (architecture.md §7): refundDeposit touches no Prisma of its
// own -- Stripe, booking's deposit read/write and billing's intent and
// status writes are mocked at their boundaries. The writes themselves are
// proven on real rows in billing.integration.test.ts.
describe("refundDeposit", () => {
  const bookingRequestId = "request-1";
  // Deliberately different from the view's PaymentIntent, so the tests
  // can tell which one is refunded.
  const intentPaymentIntentId = "pi_intent_123";
  let consoleErrorSpy: MockInstance<typeof console.error>;

  function depositView(
    overrides: Partial<BookingRequestDepositView> = {}
  ): BookingRequestDepositView {
    return {
      id: bookingRequestId,
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_2",
      status: "CANCELLED_BY_CLIENT",
      depositPaid: true,
      stripePaymentIntentId: "pi_refund_123",
      depositRefunded: false,
      estimatedPrice: null,
      clientEnforcePrecharge: false,
      ...overrides,
    };
  }

  function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(`Write failed for ${bookingRequestId}`, {
      code,
      clientVersion: "test",
    });
  }

  beforeEach(() => {
    createRefundMock.mockReset();
    vi.mocked(getBookingRequestForDeposit).mockReset().mockResolvedValue(depositView());
    vi.mocked(recordDepositRefund).mockReset();
    vi.mocked(recordDepositRefundIntent).mockReset().mockResolvedValue({
      stripePaymentIntentId: intentPaymentIntentId,
      stripeRefundId: null,
    });
    vi.mocked(advanceDepositRefundStatus).mockReset().mockResolvedValue(true);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("records the intent, refunds its PaymentIntent with the booking's metadata and key, then writes Stripe's status", async () => {
    createRefundMock.mockResolvedValue({ id: "re_123", status: "succeeded" });

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(recordDepositRefundIntent).toHaveBeenCalledWith(bookingRequestId, "pi_refund_123");
    expect(createRefundMock).toHaveBeenCalledWith(
      { payment_intent: intentPaymentIntentId, metadata: { bookingRequestId } },
      { idempotencyKey: `deposit-refund:${bookingRequestId}` }
    );
    expect(advanceDepositRefundStatus).toHaveBeenCalledWith({
      bookingRequestId,
      stripeRefundId: "re_123",
      stripeStatus: "succeeded",
      failureReason: undefined,
    });
    expect(recordDepositRefund).toHaveBeenCalledWith(bookingRequestId, "re_123");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    { status: "pending", failure_reason: undefined },
    { status: "failed", failure_reason: "expired_or_canceled_card" },
    { status: null, failure_reason: undefined },
  ])(
    "passes Stripe's $status status and failure reason through unmapped",
    async ({ status, failure_reason }) => {
      createRefundMock.mockResolvedValue({ id: "re_123", status, failure_reason });

      const result = await refundDeposit(bookingRequestId);

      expect(result).toEqual({ success: true });
      expect(advanceDepositRefundStatus).toHaveBeenCalledWith({
        bookingRequestId,
        stripeRefundId: "re_123",
        stripeStatus: status,
        failureReason: failure_reason,
      });
      expect(recordDepositRefund).toHaveBeenCalledWith(bookingRequestId, "re_123");
    }
  );

  it("succeeds when the status write is refused, such as after a concurrent caller wrote first", async () => {
    createRefundMock.mockResolvedValue({ id: "re_123", status: "succeeded" });
    vi.mocked(advanceDepositRefundStatus).mockResolvedValue(false);

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("is idempotent when the deposit was already refunded", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ depositRefunded: true })
    );

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(recordDepositRefundIntent).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "doesn't exist",
      view: null,
      error: DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
    },
    {
      name: "was never paid",
      view: { depositPaid: false, stripePaymentIntentId: null },
      error: DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
    },
    {
      name: "is paid but has no PaymentIntent id to refund against",
      view: { stripePaymentIntentId: null },
      error: DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
    },
  ])("rejects a request that $name without recording an intent", async ({ view, error }) => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      view === null ? null : depositView(view)
    );

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: false, error });
    expect(recordDepositRefundIntent).not.toHaveBeenCalled();
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("returns the generic error without calling Stripe when the intent can't be recorded", async () => {
    vi.mocked(recordDepositRefundIntent).mockRejectedValue(prismaError("P1008"));

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE });
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "refundDeposit",
      reason: "intent_record_failed",
      severity: "warning",
      bookingRequestId,
      errorCode: "P1008",
    });
  });

  // Whatever the row's status, FAILED included (a FAILED row on real data
  // is in billing.integration.test.ts).
  it("makes no second Stripe call when the intent already holds a refund id", async () => {
    vi.mocked(recordDepositRefundIntent).mockResolvedValue({
      stripePaymentIntentId: intentPaymentIntentId,
      stripeRefundId: "re_existing",
    });

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(advanceDepositRefundStatus).not.toHaveBeenCalled();
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it("returns the generic error and leaves the intent unwritten when the Stripe call itself fails", async () => {
    createRefundMock.mockRejectedValue(new Error("Stripe network error"));

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE });
    expect(advanceDepositRefundStatus).not.toHaveBeenCalled();
    expect(recordDepositRefund).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "refundDeposit",
      reason: "stripe_create_failed",
      severity: "warning",
      bookingRequestId,
      paymentIntentId: intentPaymentIntentId,
    });
  });

  it("still reports success and raises a critical alert when Stripe succeeds but the status write fails", async () => {
    createRefundMock.mockResolvedValue({ id: "re_write_fail", status: "succeeded" });
    vi.mocked(advanceDepositRefundStatus).mockRejectedValue(prismaError("P2002"));

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "refundDeposit",
      reason: "record_failed",
      severity: "critical",
      bookingRequestId,
      stripeRefundId: "re_write_fail",
      errorCode: "P2002",
    });
    expect(recordDepositRefund).toHaveBeenCalledWith(bookingRequestId, "re_write_fail");
  });

  it("logs no Prisma code for a status write that fails with a non-Prisma error", async () => {
    createRefundMock.mockResolvedValue({ id: "re_write_fail", status: "succeeded" });
    vi.mocked(advanceDepositRefundStatus).mockRejectedValue(new Error("connection reset"));

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "record_failed", errorCode: undefined })
    );
  });

  it("still reports success when the legacy mirror write fails", async () => {
    createRefundMock.mockResolvedValue({ id: "re_mirror_fail", status: "succeeded" });
    vi.mocked(recordDepositRefund).mockRejectedValue(prismaError("P2025"));

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(advanceDepositRefundStatus).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "refundDeposit",
      reason: "legacy_mirror_failed",
      severity: "warning",
      bookingRequestId,
      stripeRefundId: "re_mirror_fail",
      errorCode: "P2025",
    });
  });
});
