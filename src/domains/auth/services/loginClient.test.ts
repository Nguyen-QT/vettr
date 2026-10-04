import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";
import { hashPassword } from "./hashPassword";
import { loginClient } from "./loginClient";
import { recordAuditEvent } from "./recordAuditEvent";
import * as verifyPasswordModule from "./verifyPassword";

vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

// Spies on the real implementation rather than stubbing a fake result --
// existing cases below still exercise real scrypt verification; new
// lockout cases only need to assert whether it was called at all.
vi.mock("./verifyPassword", async (importOriginal) => {
  const actual = await importOriginal<typeof verifyPasswordModule>();
  return { verifyPassword: vi.fn(actual.verifyPassword) };
});

describe("loginClient", () => {
  let clientProfileId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    vi.mocked(verifyPasswordModule.verifyPassword).mockClear();
    vi.mocked(recordAuditEvent).mockClear();
    clientProfileId = randomUUID();
    email = `${clientProfileId}-account@example.com`;
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email: `${clientProfileId}@example.com`,
      },
    });
    await prisma.account.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "CLIENT",
        clientProfileId,
        emailVerifiedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      await prisma.session.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.clientProfile.delete({ where: { id: clientProfileId } });
  });

  it("creates a session and returns the linked clientProfileId for correct credentials", async () => {
    const result = await loginClient({ email, password });

    expect(result.success).toBe(true);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    if (!result.success || "pendingVerification" in result) return;
    expect(result.clientProfileId).toBe(clientProfileId);

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });
    expect(session).not.toBeNull();
  });

  it("rejects an incorrect password without creating a session", async () => {
    const result = await loginClient({ email, password: "wrong password" });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "INVALID_PASSWORD",
      accountId: account?.id,
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("attemptedEmail");
  });

  it("rejects an email with no matching account", async () => {
    const result = await loginClient({
      email: "no-such-account@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
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
    const artistId = randomUUID();
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Login Client Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    const artistEmail = `${artistId}-account@example.com`;
    await prisma.account.create({
      data: {
        email: artistEmail,
        passwordHash: await hashPassword(password),
        role: "ARTIST",
        artistId,
      },
    });

    const result = await loginClient({ email: artistEmail, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });

    const wrongRoleAccount = await prisma.account.findUnique({ where: { email: artistEmail } });
    expect(wrongRoleAccount?.failedLoginAttempts).toBe(0);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledWith({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "ROLE_MISMATCH",
      attemptedEmail: artistEmail,
    });
    expect(vi.mocked(recordAuditEvent).mock.calls[0][0]).not.toHaveProperty("accountId");

    await prisma.account.delete({ where: { email: artistEmail } });
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("rejects a locked account even with the correct password, without calling verifyPassword", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const result = await loginClient({ email, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
    expect(verifyPasswordModule.verifyPassword).not.toHaveBeenCalled();
    expect(recordAuditEvent).not.toHaveBeenCalled();

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(account?.lockedUntil).not.toBeNull();
  });

  it("logs in and resets the counter once a lockout has naturally expired", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() - 1000) },
    });

    const result = await loginClient({ email, password });

    expect(result.success).toBe(true);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });

  it("increments the failed-attempt counter on a wrong password", async () => {
    await loginClient({ email, password: "wrong password" });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(1);
  });

  it("locks the account when a wrong password hits MAX_FAILED_LOGIN_ATTEMPTS", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1, lockedUntil: null },
    });

    await loginClient({ email, password: "wrong password" });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(account?.lockedUntil).not.toBeNull();
    expect(account?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns pendingVerification with no session for an unverified account and correct password", async () => {
    await prisma.account.update({ where: { email }, data: { emailVerifiedAt: null } });

    const result = await loginClient({ email, password });

    expect(result).toEqual({ success: true, pendingVerification: true, clientProfileId });
    const account = await prisma.account.findUnique({ where: { email } });
    expect(await prisma.session.count({ where: { accountId: account?.id } })).toBe(0);
  });

  it("rejects an unverified account with a wrong password and still counts the failure", async () => {
    await prisma.account.update({ where: { email }, data: { emailVerifiedAt: null } });

    const result = await loginClient({ email, password: "wrong password" });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(1);
  });

  it("resets the counter but stays pending for an unverified account with prior failures", async () => {
    await prisma.account.update({
      where: { email },
      data: { emailVerifiedAt: null, failedLoginAttempts: 3, lockedUntil: null },
    });

    const result = await loginClient({ email, password });

    expect(result).toEqual({ success: true, pendingVerification: true, clientProfileId });
    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(0);
  });

  it("lockout takes precedence over pendingVerification for an unverified locked account", async () => {
    await prisma.account.update({
      where: { email },
      data: {
        emailVerifiedAt: null,
        failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS,
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });

    const result = await loginClient({ email, password });

    expect(result).toEqual({ success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE });
    expect(verifyPasswordModule.verifyPassword).not.toHaveBeenCalled();
  });

  it("resets the counter on a successful login after prior failures", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: 3, lockedUntil: null },
    });

    const result = await loginClient({ email, password });

    expect(result.success).toBe(true);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });
});
