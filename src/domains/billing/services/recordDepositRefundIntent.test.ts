import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { recordDepositRefundIntent } from "./recordDepositRefundIntent";

// Mocked-Prisma unit test (architecture.md §7). That concurrent callers
// share one row, and that an existing row is left untouched, is proven
// against a real database in billing.integration.test.ts.
describe("recordDepositRefundIntent", () => {
  const bookingRequestId = "request-1";
  const stripePaymentIntentId = "pi_123";

  it("inserts a PENDING intent only if the booking has none, then reads the row back", async () => {
    prismaMock.depositRefund.createMany.mockResolvedValue({ count: 1 });
    prismaMock.depositRefund.findUniqueOrThrow.mockResolvedValue({
      stripePaymentIntentId,
      stripeRefundId: null,
    } as never);

    const intent = await recordDepositRefundIntent(bookingRequestId, stripePaymentIntentId);

    expect(intent).toEqual({ stripePaymentIntentId, stripeRefundId: null });
    expect(prismaMock.depositRefund.createMany).toHaveBeenCalledWith({
      data: [{ bookingRequestId, stripePaymentIntentId }],
      skipDuplicates: true,
    });
    expect(prismaMock.depositRefund.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { bookingRequestId },
      select: { stripePaymentIntentId: true, stripeRefundId: true },
    });
  });

  it("returns the existing row, its own PaymentIntent and refund id, when the insert skips", async () => {
    prismaMock.depositRefund.createMany.mockResolvedValue({ count: 0 });
    prismaMock.depositRefund.findUniqueOrThrow.mockResolvedValue({
      stripePaymentIntentId: "pi_recorded_first",
      stripeRefundId: "re_123",
    } as never);

    const intent = await recordDepositRefundIntent(bookingRequestId, stripePaymentIntentId);

    expect(intent).toEqual({ stripePaymentIntentId: "pi_recorded_first", stripeRefundId: "re_123" });
    expect(prismaMock.depositRefund.update).not.toHaveBeenCalled();
    expect(prismaMock.depositRefund.upsert).not.toHaveBeenCalled();
  });

  it("lets a database error reach the caller", async () => {
    prismaMock.depositRefund.createMany.mockRejectedValue(new Error("db down"));

    await expect(
      recordDepositRefundIntent(bookingRequestId, stripePaymentIntentId)
    ).rejects.toThrow("db down");
    expect(prismaMock.depositRefund.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
