import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { recordDepositPaymentIntent } from "./recordDepositPaymentIntent";

// Mocked-Prisma unit test (architecture.md §7).
describe("recordDepositPaymentIntent", () => {
  it("persists the deposit amount and PaymentIntent id", async () => {
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    await recordDepositPaymentIntent("request-1", {
      depositAmount: 30,
      stripePaymentIntentId: "pi_record_123",
    });

    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { depositAmount: 30, stripePaymentIntentId: "pi_record_123" },
    });
  });
});
