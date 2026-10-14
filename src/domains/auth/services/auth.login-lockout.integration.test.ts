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
// that arms and restarts the lock, and the expiry boundary.
const tracker = createIntegrationTracker();

const PASSWORD = "correct horse battery staple";
const WRONG_PASSWORD = "wrong password";
const REJECTED = { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
const ONE_MINUTE_MS = 60_000;

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
});
