import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/generated/prisma/client";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import { createSession } from "./createSession";
import { loginArtist } from "./loginArtist";
import { recordAuditEvent } from "./recordAuditEvent";
import { reserveLoginAttempt } from "./reserveLoginAttempt";
import { resetFailedLoginAttempts } from "./resetFailedLoginAttempts";
import { verifyPassword } from "./verifyPassword";

// Mocked-Prisma unit test (architecture.md §7): the account lookup is stubbed
// and same-domain collaborators are mocked, so assertions are on delegation
// and payloads rather than reading rows back. The lockout itself is
// reserveLoginAttempt's single UPDATE; its SQL runs against Postgres in
// auth.login-lockout.integration.test.ts.
vi.mock("./createSession", () => ({ createSession: vi.fn() }));
vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./reserveLoginAttempt", () => ({ reserveLoginAttempt: vi.fn() }));
vi.mock("./resetFailedLoginAttempts", () => ({ resetFailedLoginAttempts: vi.fn() }));
vi.mock("./verifyPassword", () => ({ verifyPassword: vi.fn() }));

const NOW = new Date("2026-03-01T12:00:00.000Z");
const SESSION_EXPIRES_AT = new Date("2026-03-08T12:00:00.000Z");
const EMAIL = "account-1@example.com";
const PASSWORD = "correct horse battery staple";

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    email: EMAIL,
    passwordHash: "stored-hash",
    role: "ARTIST",
    createdAt: NOW,
    updatedAt: NOW,
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    artistId: "artist-1",
    clientProfileId: null,
    ...overrides,
  };
}

describe("loginArtist", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(reserveLoginAttempt).mockResolvedValue(true);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue({
      id: "session-1",
      expiresAt: SESSION_EXPIRES_AT,
      createdAt: NOW,
      accountId: "account-1",
      activeRole: "ARTIST",
    });
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("creates a session, resets the counter and returns the linked artistId for correct credentials", async () => {
    const result = await loginArtist({ email: EMAIL, password: PASSWORD });

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({ where: { email: EMAIL } });
    expect(reserveLoginAttempt).toHaveBeenCalledWith("account-1");
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, "stored-hash");
    // Unconditional: the reservation counted this attempt even on a clean account.
    expect(resetFailedLoginAttempts).toHaveBeenCalledWith("account-1");
    expect(createSession).toHaveBeenCalledWith("account-1", "ARTIST");
    expect(result).toEqual({
      success: true,
      sessionId: "session-1",
      expiresAt: SESSION_EXPIRES_AT,
      artistId: "artist-1",
    });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });

  it("reserves the attempt before checking the password", async () => {
    await loginArtist({ email: EMAIL, password: PASSWORD });

    const [reservedAt] = vi.mocked(reserveLoginAttempt).mock.invocationCallOrder;
    const [verifiedAt] = vi.mocked(verifyPassword).mock.invocationCallOrder;
    expect(reservedAt).toBeLessThan(verifiedAt);
  });

  it("rejects an incorrect password with an audit row and no further write", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const result = await loginArtist({ email: EMAIL, password: "wrong password" });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(reserveLoginAttempt).toHaveBeenCalledTimes(1);
    expect(resetFailedLoginAttempts).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "INVALID_PASSWORD",
      accountId: "account-1",
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("attemptedEmail");
  });

  it("rejects a locked account even with the correct password, without calling verifyPassword", async () => {
    vi.mocked(reserveLoginAttempt).mockResolvedValue(false);

    const result = await loginArtist({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(resetFailedLoginAttempts).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("leaves the lock decision to the reservation, not the possibly stale row it read", async () => {
    // The row says locked, but a reset may have committed since the read.
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({ failedLoginAttempts: 5, lockedUntil: new Date(NOW.getTime() + 60_000) })
    );

    const result = await loginArtist({ email: EMAIL, password: PASSWORD });

    expect(reserveLoginAttempt).toHaveBeenCalledWith("account-1");
    expect(result.success).toBe(true);
  });

  it("rejects an email with no matching account without reserving an attempt", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);

    const result = await loginArtist({ email: "no-such-account@example.com", password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(reserveLoginAttempt).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ACCOUNT_NOT_FOUND",
      attemptedEmail: "no-such-account@example.com",
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("accountId");
  });

  it("rejects a non-ARTIST account even with the correct password, without reserving an attempt", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({ role: "CLIENT", artistId: null, clientProfileId: "client-1" })
    );

    const result = await loginArtist({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    // A probe against a non-artist email never touches that account's counter.
    expect(reserveLoginAttempt).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ROLE_MISMATCH",
      attemptedEmail: EMAIL,
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("accountId");
  });
});
