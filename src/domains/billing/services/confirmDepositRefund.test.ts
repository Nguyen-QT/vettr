import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { recordDepositRefund } from "@/domains/booking/services/recordDepositRefund";
import type { BookingRequestDepositView } from "@/domains/booking/types";

import { confirmDepositRefund } from "./confirmDepositRefund";

vi.mock("@/domains/booking/services/getBookingRequestByPaymentIntentId", () => ({
  getBookingRequestByPaymentIntentId: vi.fn(),
}));
vi.mock("@/domains/booking/services/recordDepositRefund", () => ({
  recordDepositRefund: vi.fn(),
}));

// Unit test (architecture.md §7): confirmDepositRefund touches no Prisma
// of its own -- both booking calls are mocked at their public contract.
describe("confirmDepositRefund", () => {
  function depositView(
    overrides: Partial<BookingRequestDepositView> = {}
  ): BookingRequestDepositView {
    return {
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_2",
      status: "CANCELLED_BY_CLIENT",
      depositPaid: true,
      stripePaymentIntentId: "pi_123",
      depositRefunded: false,
      estimatedPrice: null,
      clientEnforcePrecharge: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockReset();
    vi.mocked(recordDepositRefund).mockReset();
  });

  it("records the refund id for the matching request", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(depositView());

    const result = await confirmDepositRefund("pi_123", "re_123");

    expect(result).toEqual({ success: true });
    expect(getBookingRequestByPaymentIntentId).toHaveBeenCalledWith("pi_123");
    expect(recordDepositRefund).toHaveBeenCalledWith("request-1", "re_123");
  });

  it("is idempotent when called again for an already-confirmed refund", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ depositRefunded: true })
    );

    const result = await confirmDepositRefund("pi_123", "re_456");

    expect(result).toEqual({ success: true });
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it("rejects a PaymentIntent id that matches no request", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(null);

    const result = await confirmDepositRefund("pi_unknown", "re_unknown");

    expect(result.success).toBe(false);
    expect(recordDepositRefund).not.toHaveBeenCalled();
  });

  it("only records against the request the PaymentIntent lookup resolved to", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ id: "request-999", stripePaymentIntentId: "pi_999" })
    );

    await confirmDepositRefund("pi_999", "re_999");

    expect(recordDepositRefund).toHaveBeenCalledTimes(1);
    expect(recordDepositRefund).toHaveBeenCalledWith("request-999", "re_999");
  });
});
