import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS } from "../constants";
import { recordDepositRefundRetry } from "./recordDepositRefundRetry";

// Mocked-Prisma unit test (architecture.md §7). The conditional increment
// itself (a row with a refund id isn't counted, updatedAt moves, concurrent
// increments alert once) is proven against a real database in
// billing.integration.test.ts.
describe("recordDepositRefundRetry", () => {
  const bookingRequestId = "request-1";
  const stripePaymentIntentId = "pi_123";
  let consoleErrorSpy: MockInstance<typeof console.error>;

  function countedRow(retryAttempts: number): never {
    return [{ retryAttempts, stripePaymentIntentId }] as never;
  }

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("increments only an id-less PENDING row, in one conditional update", async () => {
    prismaMock.depositRefund.updateManyAndReturn.mockResolvedValue(countedRow(1));

    await recordDepositRefundRetry(bookingRequestId);

    expect(prismaMock.depositRefund.updateManyAndReturn).toHaveBeenCalledTimes(1);
    expect(prismaMock.depositRefund.updateManyAndReturn).toHaveBeenCalledWith({
      where: { bookingRequestId, status: "PENDING", stripeRefundId: null },
      data: { retryAttempts: { increment: 1 } },
      select: { retryAttempts: true, stripePaymentIntentId: true },
    });
  });

  it("raises one critical alert with ids only when the increment reaches the threshold", async () => {
    prismaMock.depositRefund.updateManyAndReturn.mockResolvedValue(
      countedRow(DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS)
    );

    await recordDepositRefundRetry(bookingRequestId);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "recordDepositRefundRetry",
      reason: "refund_retry_failing",
      severity: "critical",
      bookingRequestId,
      paymentIntentId: stripePaymentIntentId,
    });
  });

  it.each([DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS - 1, DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS + 1])(
    "doesn't alert for an increment that returns %i",
    async (retryAttempts) => {
      prismaMock.depositRefund.updateManyAndReturn.mockResolvedValue(countedRow(retryAttempts));

      await recordDepositRefundRetry(bookingRequestId);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it("does nothing more when no row was counted, such as one that got its refund id", async () => {
    prismaMock.depositRefund.updateManyAndReturn.mockResolvedValue([]);

    await expect(recordDepositRefundRetry(bookingRequestId)).resolves.toBeUndefined();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("never reads the row before writing it", async () => {
    prismaMock.depositRefund.updateManyAndReturn.mockResolvedValue(
      countedRow(DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS)
    );

    await recordDepositRefundRetry(bookingRequestId);

    expect(prismaMock.depositRefund.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.depositRefund.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets a database error reach the caller", async () => {
    prismaMock.depositRefund.updateManyAndReturn.mockRejectedValue(new Error("db down"));

    await expect(recordDepositRefundRetry(bookingRequestId)).rejects.toThrow("db down");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
