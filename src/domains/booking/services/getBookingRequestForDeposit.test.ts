import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getBookingRequestForDeposit } from "./getBookingRequestForDeposit";

// Mocked-Prisma unit test (architecture.md §7).
describe("getBookingRequestForDeposit", () => {
  function row(enforcePrecharge: boolean) {
    return {
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_2",
      status: "APPROVED",
      depositPaid: true,
      stripePaymentIntentId: "pi_view_123",
      depositRefunded: false,
      estimatedPrice: "150",
      client: { enforcePrecharge },
    } as never;
  }

  it("returns the narrow view for an existing request", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(row(false));

    const result = await getBookingRequestForDeposit("request-1");

    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "request-1" } })
    );
    expect(result).toEqual({
      id: "request-1",
      clientId: "client-1",
      artistId: "artist-1",
      tier: "TIER_2",
      status: "APPROVED",
      depositPaid: true,
      stripePaymentIntentId: "pi_view_123",
      depositRefunded: false,
      estimatedPrice: 150,
      clientEnforcePrecharge: false,
    });
  });

  it("reflects the client's enforcePrecharge flag", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(row(true));

    const result = await getBookingRequestForDeposit("request-1");

    expect(result?.clientEnforcePrecharge).toBe(true);
  });

  it("returns null for a request that doesn't exist", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await getBookingRequestForDeposit("missing");

    expect(result).toBeNull();
  });
});
