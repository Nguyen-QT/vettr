import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { REQUEST_NOT_FOUND_ERROR_MESSAGE } from "../constants";
import { updateBookingPaymentMethod } from "./updateBookingPaymentMethod";

// Mocked-Prisma unit test (architecture.md §7).
describe("updateBookingPaymentMethod", () => {
  const requestId = "request-1";
  const artistId = "artist-1";

  it("overrides the payment method for the owning artist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({ artistId } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    const result = await updateBookingPaymentMethod({
      bookingRequestId: requestId,
      artistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({ success: true });
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: requestId },
      data: { paymentMethod: "CARD" },
    });
  });

  it("rejects an artist who does not own the request", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "other-artist",
    } as never);

    const result = await updateBookingPaymentMethod({
      bookingRequestId: requestId,
      artistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a request id that does not exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await updateBookingPaymentMethod({
      bookingRequestId: "missing",
      artistId,
      paymentMethod: "CARD",
    });

    expect(result).toEqual({
      success: false,
      error: REQUEST_NOT_FOUND_ERROR_MESSAGE,
    });
    expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  });
});
