import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { getDepositRefundStatuses } from "./getDepositRefundStatuses";

// Mocked-Prisma unit test (architecture.md §7): getDepositRefundStatuses
// is one batched DepositRefund read keyed by booking.
describe("getDepositRefundStatuses", () => {
  it("keys each booking's refund status by its own id, from one batched query", async () => {
    prismaMock.depositRefund.findMany.mockResolvedValue([
      { bookingRequestId: "r1", status: "PENDING" },
      { bookingRequestId: "r2", status: "SUCCEEDED" },
      { bookingRequestId: "r3", status: "FAILED" },
    ] as never);

    const result = await getDepositRefundStatuses(["r1", "r2", "r3"]);

    expect(result).toEqual({ r1: "PENDING", r2: "SUCCEEDED", r3: "FAILED" });
    expect(prismaMock.depositRefund.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.depositRefund.findMany).toHaveBeenCalledWith({
      where: { bookingRequestId: { in: ["r1", "r2", "r3"] } },
      select: { bookingRequestId: true, status: true },
    });
  });

  it("leaves out a booking with no refund row", async () => {
    prismaMock.depositRefund.findMany.mockResolvedValue([
      { bookingRequestId: "r1", status: "SUCCEEDED" },
    ] as never);

    const result = await getDepositRefundStatuses(["r1", "r2"]);

    expect(result).toEqual({ r1: "SUCCEEDED" });
    expect(result.r2).toBeUndefined();
  });

  it("returns an empty object for an empty input without querying", async () => {
    const result = await getDepositRefundStatuses([]);

    expect(result).toEqual({});
    expect(prismaMock.depositRefund.findMany).not.toHaveBeenCalled();
  });

  it("lets a database error reach the caller", async () => {
    prismaMock.depositRefund.findMany.mockRejectedValue(new Error("db down"));

    await expect(getDepositRefundStatuses(["r1"])).rejects.toThrow("db down");
  });
});
