import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { markDepositPaid } from "@/domains/booking/services/markDepositPaid";
import type { BookingRequestDepositView, RequestStatus } from "@/domains/booking/types";

import { DEPOSIT_REFUND_INIT_ERROR_MESSAGE } from "../constants";
import { confirmDepositPayment } from "./confirmDepositPayment";
import { refundDeposit } from "./refundDeposit";

vi.mock("@/domains/booking/services/getBookingRequestByPaymentIntentId", () => ({
  getBookingRequestByPaymentIntentId: vi.fn(),
}));
vi.mock("@/domains/booking/services/markDepositPaid", () => ({
  markDepositPaid: vi.fn(),
}));
vi.mock("./refundDeposit", () => ({
  refundDeposit: vi.fn(),
}));

const REFUND_STATUSES: RequestStatus[] = ["CANCELLED_BY_CLIENT", "CANCELLED_BY_ARTIST", "DECLINED"];
const ALERT_STATUSES: RequestStatus[] = [
  "COMPLETED",
  "NO_SHOW",
  "PENDING",
  "AWAITING_SLOT_CONFIRMATION",
];

// Unit test (architecture.md §7): confirmDepositPayment touches no Prisma
// of its own -- both booking calls and billing's refundDeposit are mocked
// at their public contract.
describe("confirmDepositPayment", () => {
  function depositView(
    overrides: Partial<BookingRequestDepositView> = {}
  ): BookingRequestDepositView {
    return {
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_2",
      status: "APPROVED",
      depositPaid: false,
      stripePaymentIntentId: "pi_123",
      depositRefunded: false,
      estimatedPrice: 150,
      clientEnforcePrecharge: false,
      ...overrides,
    };
  }

  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockReset();
    vi.mocked(markDepositPaid).mockReset().mockResolvedValue("APPROVED");
    vi.mocked(refundDeposit).mockReset().mockResolvedValue({ success: true });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("flips depositPaid to true for the matching request", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(depositView());

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(getBookingRequestByPaymentIntentId).toHaveBeenCalledWith("pi_123");
    expect(markDepositPaid).toHaveBeenCalledWith("request-1");
  });

  it("is idempotent when called again for an already-confirmed request", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ depositPaid: true })
    );

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(markDepositPaid).not.toHaveBeenCalled();
  });

  it("rejects a PaymentIntent id that matches no request", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(null);

    const result = await confirmDepositPayment("pi_unknown");

    expect(result.success).toBe(false);
    expect(markDepositPaid).not.toHaveBeenCalled();
    expect(refundDeposit).not.toHaveBeenCalled();
  });

  it("only flips the request the PaymentIntent lookup resolved to", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ id: "request-999", stripePaymentIntentId: "pi_999" })
    );

    await confirmDepositPayment("pi_999");

    expect(markDepositPaid).toHaveBeenCalledTimes(1);
    expect(markDepositPaid).toHaveBeenCalledWith("request-999");
  });

  it("keeps a payment on an APPROVED booking without refunding or alerting", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(depositView());

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(refundDeposit).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each(REFUND_STATUSES)("refunds a payment that lands on a %s booking", async (status) => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(depositView({ status }));
    vi.mocked(markDepositPaid).mockResolvedValue(status);

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(markDepositPaid).toHaveBeenCalledWith("request-1");
    expect(refundDeposit).toHaveBeenCalledWith("request-1");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("refunds from the status markDepositPaid returns, not the earlier read", async () => {
    // A cancel committed between the lookup and the depositPaid write.
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ status: "APPROVED" })
    );
    vi.mocked(markDepositPaid).mockResolvedValue("CANCELLED_BY_CLIENT");

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(refundDeposit).toHaveBeenCalledWith("request-1");
  });

  it("re-attempts the refund on a redelivery for an already-paid cancelled booking", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ status: "CANCELLED_BY_ARTIST", depositPaid: true })
    );

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(markDepositPaid).not.toHaveBeenCalled();
    expect(refundDeposit).toHaveBeenCalledWith("request-1");
  });

  it("throws with the booking id when the refund of a newly paid deposit fails", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ status: "DECLINED" })
    );
    vi.mocked(markDepositPaid).mockResolvedValue("DECLINED");
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
    });

    await expect(confirmDepositPayment("pi_123")).rejects.toThrow("request-1");
  });

  it("throws when the refund retried on a redelivery fails", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ status: "CANCELLED_BY_CLIENT", depositPaid: true })
    );
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
    });

    await expect(confirmDepositPayment("pi_123")).rejects.toThrow("request-1");
    expect(markDepositPaid).not.toHaveBeenCalled();
  });

  it.each(ALERT_STATUSES)(
    "records a payment on a %s booking and raises a critical alert without refunding",
    async (status) => {
      vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(depositView({ status }));
      vi.mocked(markDepositPaid).mockResolvedValue(status);

      const result = await confirmDepositPayment("pi_123");

      expect(result).toEqual({ success: true });
      expect(markDepositPaid).toHaveBeenCalledWith("request-1");
      expect(refundDeposit).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "confirmDepositPayment",
          severity: "critical",
          bookingRequestId: "request-1",
          paymentIntentId: "pi_123",
          status,
        })
      );
    }
  );

  it("raises no second alert on a redelivery for an already-paid COMPLETED booking", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ status: "COMPLETED", depositPaid: true })
    );

    const result = await confirmDepositPayment("pi_123");

    expect(result).toEqual({ success: true });
    expect(markDepositPaid).not.toHaveBeenCalled();
    expect(refundDeposit).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
