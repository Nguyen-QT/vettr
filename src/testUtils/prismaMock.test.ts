import { describe, expect, it } from "vitest";

import { prismaMock } from "./prismaMock";

import { prisma } from "@/lib/prisma";

describe("prismaMock", () => {
  it("flows a stubbed delegate return value through the mocked @/lib/prisma import", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      id: "account-1",
    } as never);

    const result = await prisma.account.findUnique({ where: { id: "account-1" } });

    expect(result).toEqual({ id: "account-1" });
  });

  it("does not leak stubbed state between tests after mockReset", async () => {
    const result = await prisma.account.findUnique({ where: { id: "account-1" } });

    expect(result).toBeUndefined();
  });

  it("invokes a callback-form $transaction with the mock itself as tx", async () => {
    prismaMock.session.findUnique.mockResolvedValue({ id: "session-1" } as never);

    const result = await prisma.$transaction(async (tx) => {
      expect(tx).toBe(prismaMock);
      return tx.session.findUnique({ where: { id: "session-1" } });
    });

    expect(result).toEqual({ id: "session-1" });
  });

  it("resolves an array-form $transaction", async () => {
    const result = await prisma.$transaction([
      Promise.resolve("first"),
      Promise.resolve("second"),
    ] as never);

    expect(result).toEqual(["first", "second"]);
  });

  it("propagates an overridden $transaction rejection", async () => {
    prismaMock.$transaction.mockRejectedValueOnce(new Error("transaction failed"));

    await expect(
      prisma.$transaction(async (tx) => tx.account.findUnique({ where: { id: "x" } }))
    ).rejects.toThrow("transaction failed");
  });
});
