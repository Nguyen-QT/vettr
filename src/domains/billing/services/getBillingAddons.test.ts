import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import type { BookingRequestCheckoutView } from "@/domains/booking/types";

import { getBillingAddons } from "./getBillingAddons";

vi.mock("@/domains/booking/services/getBookingRequestForCheckout", () => ({
  getBookingRequestForCheckout: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7). Creation-order sorting
// itself is Postgres's job (a 28.3 integration-tier candidate); here we
// assert the orderBy we ask for.
describe("getBillingAddons", () => {
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

  it("lists a request's addons in creation order, converting price to a number", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    prismaMock.addon.findMany.mockResolvedValue([
      { id: "a1", label: "Extra shading", price: 25 },
      { id: "a2", label: "Touch-up", price: "10.50" },
    ] as never);

    const result = await getBillingAddons(bookingRequestId, artistId);

    expect(result).toEqual({
      success: true,
      addons: [
        { id: "a1", label: "Extra shading", price: 25 },
        { id: "a2", label: "Touch-up", price: 10.5 },
      ],
    });
    expect(prismaMock.addon.findMany).toHaveBeenCalledWith({
      where: { bookingRequestId },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, price: true },
    });
  });

  it("returns an empty list for a request with no addons", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    prismaMock.addon.findMany.mockResolvedValue([]);

    const result = await getBillingAddons(bookingRequestId, artistId);

    expect(result).toEqual({ success: true, addons: [] });
  });

  it("rejects a request that does not belong to the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ artistId: "other-artist" })
    );

    const result = await getBillingAddons(bookingRequestId, artistId);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.findMany).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(null);

    const result = await getBillingAddons(bookingRequestId, artistId);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.findMany).not.toHaveBeenCalled();
  });
});
