import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { resetFailedLoginAttempts } from "./resetFailedLoginAttempts";

describe("resetFailedLoginAttempts", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("resets the failed-attempt counter and lockout on success", async () => {
    prismaMock.account.update.mockResolvedValueOnce({} as never);

    await resetFailedLoginAttempts("account_1");

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "account_1" },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("swallows an unexpected database failure and logs it", async () => {
    prismaMock.account.update.mockRejectedValueOnce(new Error("connection lost"));

    await expect(resetFailedLoginAttempts("account_1")).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("account_1"),
      expect.any(Error)
    );
  });
});
