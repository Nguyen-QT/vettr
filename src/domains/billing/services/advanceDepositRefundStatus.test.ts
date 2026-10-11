import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { advanceDepositRefundStatus } from "./advanceDepositRefundStatus";

// Mocked-Prisma unit test (architecture.md §7). The conditional write
// itself (a stale status after FAILED, a redelivered FAILED, a different
// refund id, concurrent deliveries) is proven against a real database in
// billing.integration.test.ts.
describe("advanceDepositRefundStatus", () => {
  const bookingRequestId = "request-1";
  const stripeRefundId = "re_123";
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it.each([
    { stripeStatus: "pending", status: "PENDING", idLess: ["PENDING"], sameId: [] },
    { stripeStatus: "requires_action", status: "PENDING", idLess: ["PENDING"], sameId: [] },
    {
      stripeStatus: "succeeded",
      status: "SUCCEEDED",
      idLess: ["PENDING", "SUCCEEDED"],
      sameId: ["PENDING"],
    },
    {
      stripeStatus: "failed",
      status: "FAILED",
      idLess: ["PENDING", "SUCCEEDED", "FAILED"],
      sameId: ["PENDING", "SUCCEEDED"],
    },
    {
      stripeStatus: "canceled",
      status: "FAILED",
      idLess: ["PENDING", "SUCCEEDED", "FAILED"],
      sameId: ["PENDING", "SUCCEEDED"],
    },
  ])(
    "writes Stripe's $stripeStatus as $status in one conditional update that only moves forward",
    async ({ stripeStatus, status, idLess, sameId }) => {
      prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 1 });

      const written = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId,
        stripeStatus,
      });

      expect(written).toBe(true);
      expect(prismaMock.depositRefund.updateMany).toHaveBeenCalledWith({
        where: {
          bookingRequestId,
          OR: [
            { stripeRefundId: null, status: { in: idLess } },
            { stripeRefundId, status: { in: sameId } },
          ],
        },
        data: { status, stripeRefundId },
      });
    }
  );

  it("reports a refused write when the row is ahead or holds a different refund id", async () => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 0 });

    const written = await advanceDepositRefundStatus({
      bookingRequestId,
      stripeRefundId,
      stripeStatus: "succeeded",
    });

    expect(written).toBe(false);
  });

  it("raises one critical alert with ids and the failure reason when a row newly reaches FAILED", async () => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 1 });

    await advanceDepositRefundStatus({
      bookingRequestId,
      stripeRefundId,
      stripeStatus: "failed",
      failureReason: "expired_or_canceled_card",
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "advanceDepositRefundStatus",
      reason: "refund_failed",
      severity: "critical",
      bookingRequestId,
      stripeRefundId,
      failureReason: "expired_or_canceled_card",
    });
  });

  it("alerts for a canceled refund that Stripe gives no failure reason", async () => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 1 });

    await advanceDepositRefundStatus({
      bookingRequestId,
      stripeRefundId,
      stripeStatus: "canceled",
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "advanceDepositRefundStatus",
      reason: "refund_failed",
      severity: "critical",
      bookingRequestId,
      stripeRefundId,
      failureReason: undefined,
    });
  });

  it("doesn't alert for a FAILED that writes nothing, such as a redelivered refund.failed", async () => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 0 });

    const written = await advanceDepositRefundStatus({
      bookingRequestId,
      stripeRefundId,
      stripeStatus: "failed",
      failureReason: "expired_or_canceled_card",
    });

    expect(written).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each(["pending", "succeeded"])("doesn't alert for a written %s", async (stripeStatus) => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 1 });

    await advanceDepositRefundStatus({ bookingRequestId, stripeRefundId, stripeStatus });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([null, "in_transit", "toString"])(
    "logs a warning and writes nothing for the Stripe status %s",
    async (stripeStatus) => {
      const written = await advanceDepositRefundStatus({
        bookingRequestId,
        stripeRefundId,
        stripeStatus,
      });

      expect(written).toBe(false);
      expect(prismaMock.depositRefund.updateMany).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "advanceDepositRefundStatus",
        reason: "refund_status_unknown",
        severity: "warning",
        bookingRequestId,
        stripeRefundId,
        stripeStatus,
      });
    }
  );

  it("never reads the row before writing it", async () => {
    prismaMock.depositRefund.updateMany.mockResolvedValue({ count: 1 });

    await advanceDepositRefundStatus({ bookingRequestId, stripeRefundId, stripeStatus: "failed" });

    expect(prismaMock.depositRefund.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.depositRefund.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets a database error reach the caller", async () => {
    prismaMock.depositRefund.updateMany.mockRejectedValue(new Error("db down"));

    await expect(
      advanceDepositRefundStatus({ bookingRequestId, stripeRefundId, stripeStatus: "failed" })
    ).rejects.toThrow("db down");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
