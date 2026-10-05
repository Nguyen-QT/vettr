import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import type { BookingRequestCheckoutView } from "@/domains/booking/types";

import { removeBillingAddon } from "./removeBillingAddon";

vi.mock("@/domains/booking/services/getBookingRequestForCheckout", () => ({
  getBookingRequestForCheckout: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7).
describe("removeBillingAddon", () => {
  const artistId = "artist-1";
  const addonId = "addon-1";
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

  it("removes an addon from an APPROVED request owned by the artist", async () => {
    prismaMock.addon.findUnique.mockResolvedValue({ bookingRequestId } as never);
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    prismaMock.addon.delete.mockResolvedValue({} as never);

    const result = await removeBillingAddon({ addonId, artistId });

    expect(result).toEqual({ success: true });
    expect(prismaMock.addon.findUnique).toHaveBeenCalledWith({
      where: { id: addonId },
      select: { bookingRequestId: true },
    });
    expect(getBookingRequestForCheckout).toHaveBeenCalledWith(bookingRequestId);
    expect(prismaMock.addon.delete).toHaveBeenCalledWith({
      where: { id: addonId },
    });
  });

  it("rejects removal for an addon on a request that does not belong to the artist", async () => {
    prismaMock.addon.findUnique.mockResolvedValue({ bookingRequestId } as never);
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ artistId: "other-artist" })
    );

    const result = await removeBillingAddon({ addonId, artistId });

    expect(result.success).toBe(false);
    expect(prismaMock.addon.delete).not.toHaveBeenCalled();
  });

  it("rejects removal when the booking request no longer resolves", async () => {
    prismaMock.addon.findUnique.mockResolvedValue({ bookingRequestId } as never);
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(null);

    const result = await removeBillingAddon({ addonId, artistId });

    expect(result.success).toBe(false);
    expect(prismaMock.addon.delete).not.toHaveBeenCalled();
  });

  it("rejects removal when the request is not APPROVED", async () => {
    prismaMock.addon.findUnique.mockResolvedValue({ bookingRequestId } as never);
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ status: "PENDING" })
    );

    const result = await removeBillingAddon({ addonId, artistId });

    expect(result.success).toBe(false);
    expect(prismaMock.addon.delete).not.toHaveBeenCalled();
  });

  it("rejects removal of an addon that doesn't exist", async () => {
    prismaMock.addon.findUnique.mockResolvedValue(null);

    const result = await removeBillingAddon({ addonId, artistId });

    expect(result.success).toBe(false);
    expect(getBookingRequestForCheckout).not.toHaveBeenCalled();
    expect(prismaMock.addon.delete).not.toHaveBeenCalled();
  });
});
