import { prismaMock } from "@/testUtils/prismaMock";

import { describe, expect, it } from "vitest";

import { markDepositPaid } from "./markDepositPaid";

// Mocked-Prisma unit test (architecture.md §7).
describe("markDepositPaid", () => {
  it("flips depositPaid to true", async () => {
    prismaMock.bookingRequest.update.mockResolvedValue({ status: "APPROVED" } as never);

    await markDepositPaid("request-1");

    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { depositPaid: true },
      select: { status: true },
    });
  });

  it("returns the status from its own update", async () => {
    prismaMock.bookingRequest.update.mockResolvedValue({
      status: "CANCELLED_BY_CLIENT",
    } as never);

    const status = await markDepositPaid("request-1");

    expect(status).toBe("CANCELLED_BY_CLIENT");
  });
});
