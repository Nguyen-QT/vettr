import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import type { BookingRequestCheckoutView } from "@/domains/booking/types";

import { addBillingAddon } from "./addBillingAddon";

vi.mock("@/domains/booking/services/getBookingRequestForCheckout", () => ({
  getBookingRequestForCheckout: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7): booking's checkout read
// is mocked at its public contract; only billing's own Addon table goes
// through prismaMock.
describe("addBillingAddon", () => {
  const artistId = "artist-1";
  const bookingRequestId = "request-1";
  const input = { bookingRequestId, artistId, label: "Extra shading", price: 25 };

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

  it("adds an addon to an APPROVED request owned by the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    prismaMock.addon.create.mockResolvedValue({} as never);

    const result = await addBillingAddon(input);

    expect(result).toEqual({ success: true });
    expect(getBookingRequestForCheckout).toHaveBeenCalledWith(bookingRequestId);
    expect(prismaMock.addon.create).toHaveBeenCalledWith({
      data: { bookingRequestId, label: "Extra shading", price: 25 },
    });
  });

  it("rejects a request that does not belong to the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ artistId: "other-artist" })
    );

    const result = await addBillingAddon(input);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.create).not.toHaveBeenCalled();
  });

  it("rejects a request that is not APPROVED", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ status: "PENDING" })
    );

    const result = await addBillingAddon(input);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.create).not.toHaveBeenCalled();
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(null);

    const result = await addBillingAddon(input);

    expect(result.success).toBe(false);
    expect(prismaMock.addon.create).not.toHaveBeenCalled();
  });
});
