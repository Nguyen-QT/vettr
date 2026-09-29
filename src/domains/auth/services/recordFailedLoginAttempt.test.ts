import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { LOGIN_LOCKOUT_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";
import { recordFailedLoginAttempt } from "./recordFailedLoginAttempt";

describe("recordFailedLoginAttempt", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("records a first failure without locking the account", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce({
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as never);
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 1 });

    await recordFailedLoginAttempt("account_1");

    expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
      where: { id: "account_1", failedLoginAttempts: 0, lockedUntil: null },
      data: { failedLoginAttempts: 1, lockedUntil: null },
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("locks the account on the Nth failure that hits MAX_FAILED_LOGIN_ATTEMPTS", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce({
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
      lockedUntil: null,
    } as never);
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 1 });

    await recordFailedLoginAttempt("account_1");

    expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: "account_1",
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
        lockedUntil: null,
      },
      data: {
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_DURATION_MS),
      },
    });
  });

  it("restarts the counter at 1 after a naturally-expired lockout", async () => {
    const expiredLockedUntil = new Date(Date.now() - 60_000);
    prismaMock.account.findUnique.mockResolvedValueOnce({
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      lockedUntil: expiredLockedUntil,
    } as never);
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 1 });

    await recordFailedLoginAttempt("account_1");

    expect(prismaMock.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: "account_1",
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: expiredLockedUntil,
      },
      data: { failedLoginAttempts: 1, lockedUntil: null },
    });
  });

  it("retries against fresh state when a concurrent write wins the compare-and-swap", async () => {
    prismaMock.account.findUnique
      .mockResolvedValueOnce({ failedLoginAttempts: 0, lockedUntil: null } as never)
      .mockResolvedValueOnce({ failedLoginAttempts: 1, lockedUntil: null } as never);
    prismaMock.account.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await recordFailedLoginAttempt("account_1");

    expect(prismaMock.account.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.account.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "account_1", failedLoginAttempts: 1, lockedUntil: null },
      data: { failedLoginAttempts: 2, lockedUntil: null },
    });
  });

  it("logs and gives up after exhausting compare-and-swap retries without throwing", async () => {
    prismaMock.account.findUnique.mockResolvedValue({
      failedLoginAttempts: 0,
      lockedUntil: null,
    } as never);
    prismaMock.account.updateMany.mockResolvedValue({ count: 0 });

    await expect(recordFailedLoginAttempt("account_1")).resolves.toBeUndefined();

    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(3);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("account_1"));
  });

  it("does not write when the account is already locked by a concurrent request", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce({
      failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
      lockedUntil: new Date(Date.now() + 60_000),
    } as never);

    await recordFailedLoginAttempt("account_1");

    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when the account no longer exists", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(null);

    await recordFailedLoginAttempt("missing");

    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("swallows an unexpected database failure and logs it", async () => {
    prismaMock.account.findUnique.mockRejectedValueOnce(new Error("connection lost"));

    await expect(recordFailedLoginAttempt("account_1")).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("account_1"),
      expect.any(Error)
    );
  });
});
