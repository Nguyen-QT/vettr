import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForDeposit } from "@/domains/booking/services/getBookingRequestForDeposit";
import { recordDepositRefund } from "@/domains/booking/services/recordDepositRefund";
import type { BookingRequestDepositView } from "@/domains/booking/types";

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

// Unit test (architecture.md §7): refundDeposit touches no Prisma of its
// own -- Stripe and booking's deposit read/write are mocked at their
// boundaries, same split as createDepositPaymentIntent.test.ts.
describe("refundDeposit", () => {
  const bookingRequestId = "request-1";

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

  beforeEach(() => {
    createRefundMock.mockReset();
    vi.mocked(getBookingRequestForDeposit).mockReset();
    vi.mocked(recordDepositRefund).mockReset();
  });

  it("issues a Stripe refund and records it when the deposit is paid and unrefunded", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    createRefundMock.mockResolvedValue({ id: "re_123" });

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledWith(
      { payment_intent: "pi_refund_123" },
      { idempotencyKey: `deposit-refund:${bookingRequestId}` }
    );
    expect(recordDepositRefund).toHaveBeenCalledWith(bookingRequestId, "re_123");
  });

  it("is idempotent when the deposit was already refunded", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ depositRefunded: true })
    );

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).not.toHaveBeenCalled();
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it("rejects a request whose deposit was never paid", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ depositPaid: false, stripePaymentIntentId: null })
    );

    const result = await refundDeposit(bookingRequestId);

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("rejects a paid request that has no PaymentIntent id to refund against", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(
      depositView({ stripePaymentIntentId: null })
    );

    const result = await refundDeposit(bookingRequestId);

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(null);

    const result = await refundDeposit(bookingRequestId);

    expect(result.success).toBe(false);
    expect(createRefundMock).not.toHaveBeenCalled();
  });

  it("returns a clean error when the Stripe refund call itself fails", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    createRefundMock.mockRejectedValue(new Error("Stripe network error"));

    const result = await refundDeposit(bookingRequestId);

    expect(result.success).toBe(false);
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it("still reports success when Stripe succeeds but the local write fails -- the refund already happened", async () => {
    vi.mocked(getBookingRequestForDeposit).mockResolvedValue(depositView());
    createRefundMock.mockResolvedValue({ id: "re_write_fail" });
    vi.mocked(recordDepositRefund).mockRejectedValueOnce(
      new Error("DB write failed")
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await refundDeposit(bookingRequestId);

    expect(result).toEqual({ success: true });
    expect(createRefundMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
