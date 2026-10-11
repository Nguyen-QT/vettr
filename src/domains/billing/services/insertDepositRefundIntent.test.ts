import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import type { Prisma } from "@/generated/prisma/client";

import { insertDepositRefundIntent } from "./insertDepositRefundIntent";

// Mocked-Prisma unit test (architecture.md §7). The caller's transaction is
// a separate tx mock, so the tests prove the insert goes through it rather
// than the global client. That concurrent callers share one row is proven
// against a real database in billing.integration.test.ts.
const txMock = mockDeep<Prisma.TransactionClient>();

describe("insertDepositRefundIntent", () => {
  const bookingRequestId = "request-1";
  const stripePaymentIntentId = "pi_123";

  beforeEach(() => {
    mockReset(txMock);
  });

  it("inserts a PENDING intent through the caller's transaction, skipping an existing row", async () => {
    txMock.depositRefund.createMany.mockResolvedValue({ count: 1 });

    await insertDepositRefundIntent(txMock, bookingRequestId, stripePaymentIntentId);

    expect(txMock.depositRefund.createMany).toHaveBeenCalledTimes(1);
    expect(txMock.depositRefund.createMany).toHaveBeenCalledWith({
      data: [{ bookingRequestId, stripePaymentIntentId }],
      skipDuplicates: true,
    });
    expect(prismaMock.depositRefund.createMany).not.toHaveBeenCalled();
  });

  it("resolves without touching the existing row when the insert skips", async () => {
    txMock.depositRefund.createMany.mockResolvedValue({ count: 0 });

    await expect(
      insertDepositRefundIntent(txMock, bookingRequestId, stripePaymentIntentId)
    ).resolves.toBeUndefined();
    expect(txMock.depositRefund.update).not.toHaveBeenCalled();
    expect(txMock.depositRefund.upsert).not.toHaveBeenCalled();
  });

  it("lets a database error reach the caller", async () => {
    txMock.depositRefund.createMany.mockRejectedValue(new Error("db down"));

    await expect(
      insertDepositRefundIntent(txMock, bookingRequestId, stripePaymentIntentId)
    ).rejects.toThrow("db down");
  });
});
