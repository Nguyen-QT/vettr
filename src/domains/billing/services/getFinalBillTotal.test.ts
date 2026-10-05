import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import type { BookingRequestCheckoutView } from "@/domains/booking/types";

import { getFinalBillTotal } from "./getFinalBillTotal";

vi.mock("@/domains/booking/services/getBookingRequestForCheckout", () => ({
  getBookingRequestForCheckout: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7). The sibling billing
// service getBillingAddons runs for real (same domain) against
// prismaMock.addon.findMany; booking's checkout read is mocked.
describe("getFinalBillTotal", () => {
  const artistId = "artist-1";
  const bookingRequestId = "request-1";

  function checkoutView(
    overrides: Partial<BookingRequestCheckoutView> = {}
  ): BookingRequestCheckoutView {
    return {
      id: bookingRequestId,
      artistId,
      status: "APPROVED",
      estimatedPrice: 150,
      depositAmount: null,
      depositPaid: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.mocked(getBookingRequestForCheckout).mockReset();
  });

  it("totals the estimate plus addons when no deposit was paid", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    prismaMock.addon.findMany.mockResolvedValue([
      { id: "a1", label: "Extra shading", price: 25 },
      { id: "a2", label: "Touch-up", price: 10 },
    ] as never);

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 35, depositCredit: 0, total: 185 },
    });
  });

  it("credits a paid deposit against the total", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ depositAmount: 20, depositPaid: true })
    );
    prismaMock.addon.findMany.mockResolvedValue([]);

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 0, depositCredit: 20, total: 130 },
    });
  });

  it("does not credit a configured deposit amount that was never actually paid", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ depositAmount: 20, depositPaid: false })
    );
    prismaMock.addon.findMany.mockResolvedValue([]);

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 150, addonsTotal: 0, depositCredit: 0, total: 150 },
    });
  });

  it("treats a null estimatedPrice as 0", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ estimatedPrice: null })
    );
    prismaMock.addon.findMany.mockResolvedValue([
      { id: "a1", label: "Extra shading", price: 25 },
    ] as never);

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result).toEqual({
      success: true,
      bill: { estimatedPrice: 0, addonsTotal: 25, depositCredit: 0, total: 25 },
    });
  });

  it("rejects a request that does not belong to the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ artistId: "other-artist" })
    );

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.findMany).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(null);

    const result = await getFinalBillTotal(bookingRequestId, artistId);

    expect(result.success).toBe(false);
  });
});
