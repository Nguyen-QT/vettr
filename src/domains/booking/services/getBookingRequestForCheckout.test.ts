import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getBookingRequestForCheckout } from "./getBookingRequestForCheckout";

// Mocked-Prisma unit test (architecture.md §7).
describe("getBookingRequestForCheckout", () => {
  it("returns the narrow view for an existing request, mapping Decimals to numbers", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      artistId: "artist-1",
      status: "APPROVED",
      estimatedPrice: "150",
      depositAmount: "20",
      depositPaid: true,
    } as never);

    const result = await getBookingRequestForCheckout("request-1");

    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "request-1" } })
    );
    expect(result).toEqual({
      id: "request-1",
      artistId: "artist-1",
      status: "APPROVED",
      estimatedPrice: 150,
      depositAmount: 20,
      depositPaid: true,
    });
  });

  it("returns null values for a request with no estimate or deposit yet", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      artistId: "artist-1",
      status: "PENDING",
      estimatedPrice: null,
      depositAmount: null,
      depositPaid: false,
    } as never);

    const result = await getBookingRequestForCheckout("request-1");

    expect(result).toEqual({
      id: "request-1",
      artistId: "artist-1",
      status: "PENDING",
      estimatedPrice: null,
      depositAmount: null,
      depositPaid: false,
    });
  });

  it("returns null for a request that doesn't exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await getBookingRequestForCheckout("missing");

    expect(result).toBeNull();
  });
});
