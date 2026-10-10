import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { recordDepositPaymentIntent } from "./recordDepositPaymentIntent";

// Mocked-Prisma unit test (architecture.md §7). The compare-and-set
// itself (NULL matching, stale and cancelled writes, concurrent
// replacements) is proven against a real database in
// booking.deposits-and-strikes.integration.test.ts.
describe("recordDepositPaymentIntent", () => {
  it("writes in one conditional update scoped to APPROVED and the replaced or same id", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    const written = await recordDepositPaymentIntent("request-1", {
      depositAmount: 30,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: "pi_old",
    });

    expect(written).toBe(true);
    expect(prismaMock.bookingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: "request-1",
        status: "APPROVED",
        OR: [{ stripePaymentIntentId: "pi_old" }, { stripePaymentIntentId: "pi_new" }],
      },
      data: { depositAmount: 30, stripePaymentIntentId: "pi_new" },
    });
  });

  it("matches a booking with no PaymentIntent stored yet on the first write", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    const written = await recordDepositPaymentIntent("request-1", {
      depositAmount: 30,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: null,
    });

    expect(written).toBe(true);
    expect(prismaMock.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ stripePaymentIntentId: null }, { stripePaymentIntentId: "pi_new" }],
        }),
      })
    );
  });

  it("reports a refused write when the booking moved on", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 0 });

    const written = await recordDepositPaymentIntent("request-1", {
      depositAmount: 30,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: "pi_old",
    });

    expect(written).toBe(false);
  });

  it("never reads the booking before writing it", async () => {
    prismaMock.bookingRequest.updateMany.mockResolvedValue({ count: 1 });

    await recordDepositPaymentIntent("request-1", {
      depositAmount: 30,
      stripePaymentIntentId: "pi_new",
      replacedPaymentIntentId: "pi_old",
    });

    expect(prismaMock.bookingRequest.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
