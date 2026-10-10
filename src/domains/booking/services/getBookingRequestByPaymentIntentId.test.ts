import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getBookingRequestByPaymentIntentId } from "./getBookingRequestByPaymentIntentId";

// Mocked-Prisma unit test (architecture.md §7).
describe("getBookingRequestByPaymentIntentId", () => {
  it("returns the narrow view for the request matching the PaymentIntent id", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_3",
      status: "APPROVED",
      depositPaid: false,
      stripePaymentIntentId: "pi_lookup_123",
      depositRefunded: false,
      estimatedPrice: null,
      client: { enforcePrecharge: false },
    } as never);

    const result = await getBookingRequestByPaymentIntentId("pi_lookup_123");

    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stripePaymentIntentId: "pi_lookup_123" } })
    );
    expect(result).toEqual({
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_3",
      status: "APPROVED",
      depositPaid: false,
      stripePaymentIntentId: "pi_lookup_123",
      depositRefunded: false,
      estimatedPrice: null,
      clientEnforcePrecharge: false,
    });
  });

  it("maps a Decimal estimatedPrice to a number and surfaces enforcePrecharge", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_3",
      status: "APPROVED",
      depositPaid: true,
      stripePaymentIntentId: "pi_lookup_123",
      depositRefunded: false,
      estimatedPrice: "150.5",
      client: { enforcePrecharge: true },
    } as never);

    const result = await getBookingRequestByPaymentIntentId("pi_lookup_123");

    expect(result?.estimatedPrice).toBe(150.5);
    expect(result?.clientEnforcePrecharge).toBe(true);
  });

  it("returns null for a PaymentIntent id that matches no request", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await getBookingRequestByPaymentIntentId("pi_unknown");

    expect(result).toBeNull();
  });
});
