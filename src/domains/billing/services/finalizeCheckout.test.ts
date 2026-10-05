import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBookingRequestForCheckout } from "@/domains/booking/services/getBookingRequestForCheckout";
import { markAppointmentCompleted } from "@/domains/booking/services/markAppointmentCompleted";
import type { BookingRequestCheckoutView } from "@/domains/booking/types";

import { finalizeCheckout } from "./finalizeCheckout";

vi.mock("@/domains/booking/services/getBookingRequestForCheckout", () => ({
  getBookingRequestForCheckout: vi.fn(),
}));
vi.mock("@/domains/booking/services/markAppointmentCompleted", () => ({
  markAppointmentCompleted: vi.fn(),
}));

// Unit test (architecture.md §7): finalizeCheckout only checks ownership
// and delegates. The APPROVED / past-due rules live in booking's
// markAppointmentCompleted and are tested there; here we assert the
// delegation and that its result is passed through unchanged.
describe("finalizeCheckout", () => {
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
    vi.mocked(markAppointmentCompleted).mockReset();
  });

  it("delegates to markAppointmentCompleted for a request owned by the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    vi.mocked(markAppointmentCompleted).mockResolvedValue({ success: true });

    const result = await finalizeCheckout(bookingRequestId, artistId);

    expect(result).toEqual({ success: true });
    expect(markAppointmentCompleted).toHaveBeenCalledWith({ bookingRequestId });
  });

  it("rejects a request that does not belong to the artist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(
      checkoutView({ artistId: "other-artist" })
    );

    const result = await finalizeCheckout(bookingRequestId, artistId);

    expect(result.success).toBe(false);
    expect(markAppointmentCompleted).not.toHaveBeenCalled();
  });

  it("passes through the not-yet-due rejection from markAppointmentCompleted", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(checkoutView());
    vi.mocked(markAppointmentCompleted).mockResolvedValue({
      success: false,
      error: "This appointment hasn't happened yet.",
    });

    const result = await finalizeCheckout(bookingRequestId, artistId);

    expect(result).toEqual({
      success: false,
      error: "This appointment hasn't happened yet.",
    });
  });

  it("rejects a request that doesn't exist", async () => {
    vi.mocked(getBookingRequestForCheckout).mockResolvedValue(null);

    const result = await finalizeCheckout(bookingRequestId, artistId);

    expect(result.success).toBe(false);
    expect(markAppointmentCompleted).not.toHaveBeenCalled();
  });
});
