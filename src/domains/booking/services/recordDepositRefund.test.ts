import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { recordDepositRefund } from "./recordDepositRefund";

// Mocked-Prisma unit test (architecture.md §7).
describe("recordDepositRefund", () => {
  it("flips depositRefunded to true and persists the Stripe refund id", async () => {
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    await recordDepositRefund("request-1", "re_refund_123");

    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { depositRefunded: true, stripeRefundId: "re_refund_123" },
    });
  });
});
