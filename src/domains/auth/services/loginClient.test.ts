import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account } from "@/generated/prisma/client";

import { INVALID_CREDENTIALS_ERROR_MESSAGE, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";
import { createSession } from "./createSession";
import { loginClient } from "./loginClient";
import { recordAuditEvent } from "./recordAuditEvent";
import { recordFailedLoginAttempt } from "./recordFailedLoginAttempt";
import { resetFailedLoginAttempts } from "./resetFailedLoginAttempts";
import { verifyPassword } from "./verifyPassword";

// Mocked-Prisma unit test (architecture.md §7): the account lookup is stubbed
// and same-domain collaborators are mocked, so assertions are on delegation
// and payloads rather than reading rows back. The lockout-threshold write
// itself is covered by recordFailedLoginAttempt.test.ts.
vi.mock("./createSession", () => ({ createSession: vi.fn() }));
vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./recordFailedLoginAttempt", () => ({ recordFailedLoginAttempt: vi.fn() }));
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
    role: "CLIENT",
    createdAt: NOW,
    updatedAt: NOW,
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    emailVerificationCodeHash: null,
    emailVerificationCodeExpiresAt: null,
    emailVerificationCodeSentAt: null,
    emailVerificationAttempts: 0,
    artistId: null,
    clientProfileId: "client-1",
    ...overrides,
  };
}

describe("loginClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(createSession).mockResolvedValue({
      id: "session-1",
      expiresAt: SESSION_EXPIRES_AT,
      createdAt: NOW,
      accountId: "account-1",
      activeRole: "CLIENT",
    });
    prismaMock.account.findUnique.mockResolvedValue(buildAccount());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("creates a session and returns the linked clientProfileId for correct credentials", async () => {
    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({ where: { email: EMAIL } });
    expect(verifyPassword).toHaveBeenCalledWith(PASSWORD, "stored-hash");
    expect(createSession).toHaveBeenCalledWith("account-1", "CLIENT");
    expect(result).toEqual({
      success: true,
      sessionId: "session-1",
      expiresAt: SESSION_EXPIRES_AT,
      clientProfileId: "client-1",
    });
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(resetFailedLoginAttempts).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password without creating a session", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const result = await loginClient({ email: EMAIL, password: "wrong password" });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(createSession).not.toHaveBeenCalled();
    expect(recordFailedLoginAttempt).toHaveBeenCalledWith("account-1");
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "INVALID_PASSWORD",
      accountId: "account-1",
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("attemptedEmail");
  });

  it("rejects an email with no matching account", async () => {
    prismaMock.account.findUnique.mockResolvedValue(null);

    const result = await loginClient({ email: "no-such-account@example.com", password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
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

  it("rejects a non-CLIENT account even with the correct password", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({ role: "ARTIST", artistId: "artist-1", clientProfileId: null })
    );

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordFailedLoginAttempt).not.toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ROLE_MISMATCH",
      attemptedEmail: EMAIL,
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("accountId");
  });

  it("rejects a locked account even with the correct password, without calling verifyPassword", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(NOW.getTime() + 60_000),
      })
    );

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(recordFailedLoginAttempt).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("logs in and resets the counter once a lockout has naturally expired", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(NOW.getTime() - 1000),
      })
    );

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result.success).toBe(true);
    expect(resetFailedLoginAttempts).toHaveBeenCalledWith("account-1");
  });

  it("delegates the failed-attempt count to recordFailedLoginAttempt on a wrong password", async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await loginClient({ email: EMAIL, password: "wrong password" });

    expect(recordFailedLoginAttempt).toHaveBeenCalledTimes(1);
    expect(recordFailedLoginAttempt).toHaveBeenCalledWith("account-1");
  });

  it("returns pendingVerification with no session for an unverified account and correct password", async () => {
    prismaMock.account.findUnique.mockResolvedValue(buildAccount({ emailVerifiedAt: null }));

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an unverified account with a wrong password and still counts the failure", async () => {
    prismaMock.account.findUnique.mockResolvedValue(buildAccount({ emailVerifiedAt: null }));
    vi.mocked(verifyPassword).mockResolvedValue(false);

    const result = await loginClient({ email: EMAIL, password: "wrong password" });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(recordFailedLoginAttempt).toHaveBeenCalledWith("account-1");
  });

  it("resets the counter but stays pending for an unverified account with prior failures", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({ emailVerifiedAt: null, failedLoginAttempts: 3 })
    );

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({
      success: true,
      pendingVerification: true,
      clientProfileId: "client-1",
    });
    expect(resetFailedLoginAttempts).toHaveBeenCalledWith("account-1");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("lockout takes precedence over pendingVerification for an unverified locked account", async () => {
    prismaMock.account.findUnique.mockResolvedValue(
      buildAccount({
        emailVerifiedAt: null,
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(NOW.getTime() + 60_000),
      })
    );

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("resets the counter on a successful login after prior failures", async () => {
    prismaMock.account.findUnique.mockResolvedValue(buildAccount({ failedLoginAttempts: 3 }));

    const result = await loginClient({ email: EMAIL, password: PASSWORD });

    expect(result.success).toBe(true);
    expect(resetFailedLoginAttempts).toHaveBeenCalledWith("account-1");
  });
});
