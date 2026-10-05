import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { markDepositPaid } from "./markDepositPaid";

// Mocked-Prisma unit test (architecture.md §7).
describe("markDepositPaid", () => {
  it("flips depositPaid to true", async () => {
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    await markDepositPaid("request-1");

    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { depositPaid: true },
    });
  });
});
