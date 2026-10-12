import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import {
  DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
  DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
  DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
  DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
  DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS,
  DEPOSIT_REFUND_RETRY_BACKOFF_MS,
  DEPOSIT_REFUND_RETRY_BATCH_SIZE,
  DEPOSIT_REFUND_RETRY_BUDGET_MS,
  DEPOSIT_REFUND_RETRY_MIN_AGE_MS,
} from "../constants";
import { reconcileDepositRefundFromStripe } from "./reconcileDepositRefundFromStripe";
import { recordDepositRefundRetry } from "./recordDepositRefundRetry";
import { refundDeposit } from "./refundDeposit";
import { retryOwedDepositRefunds } from "./retryOwedDepositRefunds";

vi.mock("./reconcileDepositRefundFromStripe", () => ({
  reconcileDepositRefundFromStripe: vi.fn(),
}));
vi.mock("./refundDeposit", () => ({
  refundDeposit: vi.fn(),
}));
vi.mock("./recordDepositRefundRetry", () => ({
  recordDepositRefundRetry: vi.fn(),
}));

// Mocked-Prisma unit test (architecture.md §7), with the clock pinned so
// the cutoffs and the budget are deterministic. The sweep's own steps
// (reconcile, refund, visit count) are mocked at their boundaries; the
// candidate read's filter is proven on real rows in
// billing.integration.test.ts.
const NOW = new Date("2026-10-12T12:00:00.000Z");

interface OwedRow {
  bookingRequestId: string;
  stripePaymentIntentId: string;
}

function owedRow(n: number): OwedRow {
  return { bookingRequestId: `request-${n}`, stripePaymentIntentId: `pi_${n}` };
}

function candidates(...rows: OwedRow[]): void {
  prismaMock.depositRefund.findMany.mockResolvedValue(rows as never);
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Query failed for request-1", {
    code,
    clientVersion: "test",
  });
}

describe("retryOwedDepositRefunds", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(reconcileDepositRefundFromStripe).mockReset().mockResolvedValue("NO_REFUND");
    vi.mocked(refundDeposit).mockReset().mockResolvedValue({ success: true });
    vi.mocked(recordDepositRefundRetry).mockReset().mockResolvedValue(undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("keeps the minimum age above the longest a server action or webhook can run", () => {
    expect(DEPOSIT_REFUND_RETRY_MIN_AGE_MS).toBeGreaterThan(300 * 1000);
  });

  it("reads id-less PENDING rows old enough for their retry count, oldest first", async () => {
    candidates();

    await retryOwedDepositRefunds();

    expect(prismaMock.depositRefund.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.depositRefund.findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        stripeRefundId: null,
        OR: [
          {
            retryAttempts: { lt: DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS },
            updatedAt: { lte: new Date(NOW.getTime() - DEPOSIT_REFUND_RETRY_MIN_AGE_MS) },
          },
          {
            retryAttempts: { gte: DEPOSIT_REFUND_RETRY_ALERT_ATTEMPTS },
            updatedAt: { lte: new Date(NOW.getTime() - DEPOSIT_REFUND_RETRY_BACKOFF_MS) },
          },
        ],
      },
      orderBy: { updatedAt: "asc" },
      take: DEPOSIT_REFUND_RETRY_BATCH_SIZE,
      select: { bookingRequestId: true, stripePaymentIntentId: true },
    });
  });

  it("returns all zeros and calls nothing else when no row is owed", async () => {
    candidates();

    await expect(retryOwedDepositRefunds()).resolves.toEqual({
      reconciled: 0,
      refunded: 0,
      failed: 0,
      deferred: 0,
    });
    expect(reconcileDepositRefundFromStripe).not.toHaveBeenCalled();
    expect(refundDeposit).not.toHaveBeenCalled();
    expect(recordDepositRefundRetry).not.toHaveBeenCalled();
  });

  it("reconciles first: a refund already on Stripe is synced and nothing is created", async () => {
    candidates(owedRow(1));
    vi.mocked(reconcileDepositRefundFromStripe).mockResolvedValue("RECONCILED");

    const result = await retryOwedDepositRefunds();

    expect(reconcileDepositRefundFromStripe).toHaveBeenCalledWith("request-1", "pi_1");
    expect(refundDeposit).not.toHaveBeenCalled();
    expect(result).toEqual({ reconciled: 1, refunded: 0, failed: 0, deferred: 0 });
  });

  it("skips the create this run when the list call fails", async () => {
    candidates(owedRow(1));
    vi.mocked(reconcileDepositRefundFromStripe).mockResolvedValue("LIST_FAILED");

    const result = await retryOwedDepositRefunds();

    expect(refundDeposit).not.toHaveBeenCalled();
    expect(result).toEqual({ reconciled: 0, refunded: 0, failed: 1, deferred: 0 });
    // reconcileDepositRefundFromStripe logs its own list failure.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("refunds a row with no refund on Stripe, after checking", async () => {
    candidates(owedRow(1));

    const result = await retryOwedDepositRefunds();

    expect(refundDeposit).toHaveBeenCalledTimes(1);
    expect(refundDeposit).toHaveBeenCalledWith("request-1");
    expect(vi.mocked(reconcileDepositRefundFromStripe).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(refundDeposit).mock.invocationCallOrder[0]
    );
    expect(result).toEqual({ reconciled: 0, refunded: 1, failed: 0, deferred: 0 });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("counts refundDeposit's generic retryable error as failed without logging it again", async () => {
    candidates(owedRow(1));
    vi.mocked(refundDeposit).mockResolvedValue({
      success: false,
      error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE,
    });

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 0, failed: 1, deferred: 0 });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    DEPOSIT_REFUND_REQUEST_NOT_FOUND_ERROR_MESSAGE,
    DEPOSIT_REFUND_NOT_PAID_ERROR_MESSAGE,
    DEPOSIT_REFUND_MISSING_PAYMENT_INTENT_ERROR_MESSAGE,
  ])("counts the refusal %j as failed and logs it critical with ids only", async (error) => {
    candidates(owedRow(1));
    vi.mocked(refundDeposit).mockResolvedValue({ success: false, error });

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 0, failed: 1, deferred: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "retryOwedDepositRefunds",
      reason: "refund_refused",
      severity: "critical",
      bookingRequestId: "request-1",
      paymentIntentId: "pi_1",
    });
  });

  it.each([
    { case: "a Prisma error", thrown: prismaError("P1001"), errorCode: "P1001" },
    { case: "any other error", thrown: new Error("socket hang up"), errorCode: undefined },
  ])(
    "logs a row that throws $case with ids and the Prisma code only, and goes on with the batch",
    async ({ thrown, errorCode }) => {
      candidates(owedRow(1), owedRow(2), owedRow(3));
      vi.mocked(reconcileDepositRefundFromStripe)
        .mockResolvedValueOnce("NO_REFUND")
        .mockRejectedValueOnce(thrown);

      const result = await retryOwedDepositRefunds();

      expect(result).toEqual({ reconciled: 0, refunded: 2, failed: 1, deferred: 0 });
      expect(refundDeposit).toHaveBeenCalledWith("request-3");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "retryOwedDepositRefunds",
        reason: "row_failed",
        severity: "warning",
        bookingRequestId: "request-2",
        paymentIntentId: "pi_2",
        errorCode,
      });
    }
  );

  it("counts every row it starts once, in order and after its outcome, a throwing row included", async () => {
    candidates(owedRow(1), owedRow(2), owedRow(3));
    vi.mocked(refundDeposit)
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(prismaError("P1001"));

    await retryOwedDepositRefunds();

    expect(vi.mocked(recordDepositRefundRetry).mock.calls).toEqual([
      ["request-1"],
      ["request-2"],
      ["request-3"],
    ]);
    const refundOrder = vi.mocked(refundDeposit).mock.invocationCallOrder;
    const countOrder = vi.mocked(recordDepositRefundRetry).mock.invocationCallOrder;
    expect(refundOrder[0]).toBeLessThan(countOrder[0]);
    expect(countOrder[0]).toBeLessThan(refundOrder[1]);
  });

  it("logs a failed visit count with ids and the Prisma code only, and goes on with the batch", async () => {
    candidates(owedRow(1), owedRow(2));
    vi.mocked(recordDepositRefundRetry).mockRejectedValueOnce(prismaError("P2024"));

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 2, failed: 0, deferred: 0 });
    expect(recordDepositRefundRetry).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "retryOwedDepositRefunds",
      reason: "retry_count_failed",
      severity: "warning",
      bookingRequestId: "request-1",
      paymentIntentId: "pi_1",
      errorCode: "P2024",
    });
  });

  it("counts mixed outcomes so they sum to the rows read", async () => {
    candidates(owedRow(1), owedRow(2), owedRow(3), owedRow(4));
    vi.mocked(reconcileDepositRefundFromStripe)
      .mockResolvedValueOnce("RECONCILED")
      .mockResolvedValueOnce("LIST_FAILED")
      .mockResolvedValueOnce("NO_REFUND")
      .mockResolvedValueOnce("NO_REFUND");
    vi.mocked(refundDeposit)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: DEPOSIT_REFUND_INIT_ERROR_MESSAGE });

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 1, refunded: 1, failed: 2, deferred: 0 });
  });

  it("defers the rows left once the budget is spent, without starting or counting them", async () => {
    candidates(owedRow(1), owedRow(2), owedRow(3));
    vi.mocked(reconcileDepositRefundFromStripe).mockImplementationOnce(async () => {
      vi.setSystemTime(NOW.getTime() + DEPOSIT_REFUND_RETRY_BUDGET_MS);
      return "NO_REFUND";
    });

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 1, failed: 0, deferred: 2 });
    expect(reconcileDepositRefundFromStripe).toHaveBeenCalledTimes(1);
    expect(recordDepositRefundRetry).toHaveBeenCalledTimes(1);
    expect(recordDepositRefundRetry).toHaveBeenCalledWith("request-1");
  });

  it("still starts a row just inside the budget", async () => {
    candidates(owedRow(1), owedRow(2));
    vi.mocked(reconcileDepositRefundFromStripe).mockImplementationOnce(async () => {
      vi.setSystemTime(NOW.getTime() + DEPOSIT_REFUND_RETRY_BUDGET_MS - 1);
      return "NO_REFUND";
    });

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 2, failed: 0, deferred: 0 });
  });

  it("counts the candidate read against the budget", async () => {
    prismaMock.depositRefund.findMany.mockImplementation((async () => {
      vi.setSystemTime(NOW.getTime() + DEPOSIT_REFUND_RETRY_BUDGET_MS);
      return [owedRow(1), owedRow(2)];
    }) as never);

    const result = await retryOwedDepositRefunds();

    expect(result).toEqual({ reconciled: 0, refunded: 0, failed: 0, deferred: 2 });
    expect(reconcileDepositRefundFromStripe).not.toHaveBeenCalled();
  });

  it("lets a failed candidate read reach the caller", async () => {
    prismaMock.depositRefund.findMany.mockRejectedValue(new Error("db down"));

    await expect(retryOwedDepositRefunds()).rejects.toThrow("db down");
    expect(reconcileDepositRefundFromStripe).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
