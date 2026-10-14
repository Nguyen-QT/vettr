import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import { LOGIN_LOCKOUT_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";
import { reserveLoginAttempt } from "./reserveLoginAttempt";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const LOCK_UNTIL = new Date(NOW.getTime() + LOGIN_LOCKOUT_DURATION_MS);

// Values bound into the nth tagged-template $executeRaw call (index 0 is
// the strings array).
function boundValues(callIndex: number): unknown[] {
  return prismaMock.$executeRaw.mock.calls[callIndex].slice(1);
}

// Mocked-Prisma unit test (architecture.md §7): pins the bound values and
// how the result and failures map to true/false. The SQL itself (the casts,
// the CASE that arms and restarts the lock, concurrent re-checks) only runs
// against Postgres, in auth.login-lockout.integration.test.ts.
describe("reserveLoginAttempt", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("reserves an attempt when the update matches the account", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(1);

    await expect(reserveLoginAttempt("account-1")).resolves.toBe(true);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("reserves nothing when the update matches no row (locked or gone)", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    await expect(reserveLoginAttempt("account-1")).resolves.toBe(false);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("binds the cap, the lock expiry, the clock and the account id", async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(1);

    await reserveLoginAttempt("account-1");

    expect(boundValues(0)).toEqual([MAX_FAILED_LOGIN_ATTEMPTS, LOCK_UNTIL, NOW, "account-1", NOW]);
  });

  it("fails closed on a database error, logging only the allowlisted fields", async () => {
    // The message echoes an email, so the log assertion proves it's never logged.
    prismaMock.$executeRaw.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Raw query failed for artist@example.com", {
        code: "P2010",
        clientVersion: "test",
      })
    );

    await expect(reserveLoginAttempt("account-1")).resolves.toBe(false);

    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [
        {
          operation: "reserveLoginAttempt",
          reason: "unexpected_failure",
          accountId: "account-1",
          errorCode: "P2010",
        },
      ],
    ]);
  });

  it("fails closed on an unexpected non-Prisma error", async () => {
    prismaMock.$executeRaw.mockRejectedValueOnce(new Error("connection lost"));

    await expect(reserveLoginAttempt("account-1")).resolves.toBe(false);

    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [
        {
          operation: "reserveLoginAttempt",
          reason: "unexpected_failure",
          accountId: "account-1",
          errorCode: undefined,
        },
      ],
    ]);
  });
});
