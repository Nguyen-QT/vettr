import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestByPaymentIntentId } from "@/domains/booking/services/getBookingRequestByPaymentIntentId";
import { markDepositPaid } from "@/domains/booking/services/markDepositPaid";
import type { BookingRequestDepositView } from "@/domains/booking/types";

import { confirmDepositPayment } from "./confirmDepositPayment";

vi.mock("@/domains/booking/services/getBookingRequestByPaymentIntentId", () => ({
  getBookingRequestByPaymentIntentId: vi.fn(),
}));
vi.mock("@/domains/booking/services/markDepositPaid", () => ({
  markDepositPaid: vi.fn(),
}));

// Unit test (architecture.md §7): confirmDepositPayment touches no Prisma
// of its own -- both booking calls are mocked at their public contract.
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

  beforeEach(() => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockReset();
    vi.mocked(markDepositPaid).mockReset();
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
  });

  it("only flips the request the PaymentIntent lookup resolved to", async () => {
    vi.mocked(getBookingRequestByPaymentIntentId).mockResolvedValue(
      depositView({ id: "request-999", stripePaymentIntentId: "pi_999" })
    );

    await confirmDepositPayment("pi_999");

    expect(markDepositPaid).toHaveBeenCalledTimes(1);
    expect(markDepositPaid).toHaveBeenCalledWith("request-999");
  });
});
