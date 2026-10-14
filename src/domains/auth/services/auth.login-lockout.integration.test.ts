import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { prisma } from "@/lib/prisma";
import { createIntegrationTracker } from "@/testUtils/integrationDb";

import {
  INVALID_CREDENTIALS_ERROR_MESSAGE,
  LOGIN_LOCKOUT_DURATION_MS,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "../constants";
import { hashPassword } from "./hashPassword";
import { loginArtist } from "./loginArtist";

// Real-database artist lockout tests (28.11). reserveLoginAttempt is one raw
// UPDATE, so the mocked unit tier can only pin its bound values. These run
// the SQL itself, through loginArtist (its only caller): the casts, the CASE
// that arms and restarts the lock, and the expiry boundary. They also prove
// the lock holds under a parallel burst (28.11.2.2).
const tracker = createIntegrationTracker();

const PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "wrong password";
const REJECTED = { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
const ONE_MINUTE_MS = 60_000;
// Twice the cap, so a broken reservation would visibly overshoot it. Within
// the default pg pool size (10), so the calls genuinely race instead of
// queueing for a connection.
const BURST_WIDTH = MAX_FAILED_LOGIN_ATTEMPTS * 2;

interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

const CLEAN: LockoutState = { failedLoginAttempts: 0, lockedUntil: null };

// Hashed once in beforeAll: scrypt is deliberately slow.
let passwordHash: string;

// The account is linked to a tracked artist, so wipe() removes it along with
// its sessions and audit rows.
async function createArtistAccount(state: LockoutState = CLEAN): Promise<{ id: string; email: string }> {
  const artist = await tracker.createArtist();
  const account = await prisma.account.create({
    data: { email: artist.email, passwordHash, role: "ARTIST", artistId: artist.id, ...state },
  });
  return { id: account.id, email: account.email };
}

function readLockoutState(accountId: string): Promise<LockoutState> {
  return prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { failedLoginAttempts: true, lockedUntil: true },
  });
}

function countInvalidPasswordAudits(accountId: string): Promise<number> {
  return prisma.auditEvent.count({ where: { accountId, reasonCode: "INVALID_PASSWORD" } });
}

function countSessions(accountId: string): Promise<number> {
  return prisma.session.count({ where: { accountId } });
}

// The lock expiry comes from Node's clock during the call, so it must fall
// between the call's start and end plus the lock duration. TIMESTAMP(3)
// keeps milliseconds, so the bounds are exact.
function expectLockedBetween(lockedUntil: Date | null, startedAt: number, finishedAt: number): void {
  if (lockedUntil === null) {
    throw new Error("expected the account to be locked");
  }
  expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(startedAt + LOGIN_LOCKOUT_DURATION_MS);
  expect(lockedUntil.getTime()).toBeLessThanOrEqual(finishedAt + LOGIN_LOCKOUT_DURATION_MS);
}

// allSettled, not Promise.all: a rejection would end the wait while the other
// calls are still writing. loginArtist never throws, so every call must be
// fulfilled.
async function burst<T>(count: number, run: () => Promise<T>): Promise<T[]> {
  const settled = await Promise.allSettled(Array.from({ length: count }, run));
  expect(settled.map((result) => result.status)).toEqual(Array(count).fill("fulfilled"));
  return settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

describe("artist login lockout integration", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    await tracker.wipe();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Every case here is a normal path. A log would mean the reservation
    // failed closed, e.g. a type error in its SQL.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("reserveLoginAttempt SQL, one attempt at a time", () => {
    it("counts a wrong password on a clean account without locking it", async () => {
      const account = await createArtistAccount();

      const result = await loginArtist({ email: account.email, password: WRONG_PASSWORD });

      expect(result).toEqual(REJECTED);
      expect(await readLockoutState(account.id)).toEqual({ failedLoginAttempts: 1, lockedUntil: null });
      expect(await countInvalidPasswordAudits(account.id)).toBe(1);
    });

    it("arms the lock on the attempt that reaches MAX_FAILED_LOGIN_ATTEMPTS", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
        lockedUntil: null,
      });

      const startedAt = Date.now();
      const result = await loginArtist({ email: account.email, password: WRONG_PASSWORD });
      const finishedAt = Date.now();

      expect(result).toEqual(REJECTED);
      const state = await readLockoutState(account.id);
      expect(state.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expectLockedBetween(state.lockedUntil, startedAt, finishedAt);
    });

    it("logs in with the correct password on the last attempt and clears the lock it armed", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
        lockedUntil: null,
      });

      const result = await loginArtist({ email: account.email, password: PASSWORD });

      expect(result.success).toBe(true);
      expect(await readLockoutState(account.id)).toEqual(CLEAN);
      expect(await countSessions(account.id)).toBe(1);
    });

    it("restarts the count at 1 after a lock has expired", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() - ONE_MINUTE_MS),
      });

      const result = await loginArtist({ email: account.email, password: WRONG_PASSWORD });

      expect(result).toEqual(REJECTED);
      expect(await readLockoutState(account.id)).toEqual({ failedLoginAttempts: 1, lockedUntil: null });
    });

    it("rejects the correct password while the lock holds, without counting or auditing it", async () => {
      const locked: LockoutState = {
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() + ONE_MINUTE_MS),
      };
      const account = await createArtistAccount(locked);

      const result = await loginArtist({ email: account.email, password: PASSWORD });

      expect(result).toEqual(REJECTED);
      expect(await readLockoutState(account.id)).toEqual(locked);
      expect(await countSessions(account.id)).toBe(0);
      expect(await countInvalidPasswordAudits(account.id)).toBe(0);
    });

    it("arms the lock on a legacy row already at the cap with no lock", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: null,
      });

      const startedAt = Date.now();
      const result = await loginArtist({ email: account.email, password: WRONG_PASSWORD });
      const finishedAt = Date.now();

      expect(result).toEqual(REJECTED);
      const state = await readLockoutState(account.id);
      expect(state.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS + 1);
      expectLockedBetween(state.lockedUntil, startedAt, finishedAt);
    });
  });

  // The original finding: every password in a burst was checked before any
  // lock landed. The outer afterEach also proves no reservation failed
  // closed mid-burst.
  describe("parallel bursts", () => {
    it("checks only MAX_FAILED_LOGIN_ATTEMPTS passwords from a burst on a clean account, then holds the lock", async () => {
      const account = await createArtistAccount();

      const startedAt = Date.now();
      const results = await burst(BURST_WIDTH, () =>
        loginArtist({ email: account.email, password: WRONG_PASSWORD })
      );
      const finishedAt = Date.now();

      expect(results).toEqual(Array(BURST_WIDTH).fill(REJECTED));
      const locked = await readLockoutState(account.id);
      expect(locked.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expectLockedBetween(locked.lockedUntil, startedAt, finishedAt);
      // One audit row per password actually checked.
      expect(await countInvalidPasswordAudits(account.id)).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expect(await countSessions(account.id)).toBe(0);

      // The lock the burst armed holds against the correct password.
      expect(await loginArtist({ email: account.email, password: PASSWORD })).toEqual(REJECTED);
      expect(await readLockoutState(account.id)).toEqual(locked);
      expect(await countInvalidPasswordAudits(account.id)).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expect(await countSessions(account.id)).toBe(0);
    });

    it("gives a burst after an expired lock one fresh cycle of MAX_FAILED_LOGIN_ATTEMPTS checks", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() - ONE_MINUTE_MS),
      });

      const startedAt = Date.now();
      const results = await burst(BURST_WIDTH, () =>
        loginArtist({ email: account.email, password: WRONG_PASSWORD })
      );
      const finishedAt = Date.now();

      expect(results).toEqual(Array(BURST_WIDTH).fill(REJECTED));
      const state = await readLockoutState(account.id);
      expect(state.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
      expectLockedBetween(state.lockedUntil, startedAt, finishedAt);
      expect(await countInvalidPasswordAudits(account.id)).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    });

    it("lets only one of two concurrent correct logins on the last attempt through", async () => {
      const account = await createArtistAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1,
        lockedUntil: null,
      });

      // The first reservation arms the lock, so the second is refused
      // before the winner's reset clears it.
      const results = await burst(2, () => loginArtist({ email: account.email, password: PASSWORD }));

      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(results.filter((result) => !result.success)).toEqual([REJECTED]);
      expect(await countSessions(account.id)).toBe(1);
      expect(await readLockoutState(account.id)).toEqual(CLEAN);
      expect(await countInvalidPasswordAudits(account.id)).toBe(0);
    });
  });
});
