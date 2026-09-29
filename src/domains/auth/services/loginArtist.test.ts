import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";
import { hashPassword } from "./hashPassword";
import { loginArtist } from "./loginArtist";
import * as verifyPasswordModule from "./verifyPassword";

// Spies on the real implementation rather than stubbing a fake result --
// existing cases below still exercise real scrypt verification; new
// lockout cases only need to assert whether it was called at all.
vi.mock("./verifyPassword", async (importOriginal) => {
  const actual = await importOriginal<typeof verifyPasswordModule>();
  return { verifyPassword: vi.fn(actual.verifyPassword) };
});

describe("loginArtist", () => {
  let artistId: string;
  let email: string;
  const password = "correct horse battery staple";

  beforeEach(async () => {
    vi.mocked(verifyPasswordModule.verifyPassword).mockClear();
    artistId = randomUUID();
    email = `${artistId}-account@example.com`;
    await prisma.artist.create({
      data: {
        id: artistId,
        name: "Login Test Artist",
        instagramHandle: `test_artist_${artistId.slice(0, 8)}`,
        email: `${artistId}@example.com`,
      },
    });
    await prisma.account.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: "ARTIST",
        artistId,
      },
    });
  });

  afterEach(async () => {
    const account = await prisma.account.findUnique({ where: { email } });
    if (account) {
      await prisma.session.deleteMany({ where: { accountId: account.id } });
      await prisma.account.delete({ where: { id: account.id } });
    }
    await prisma.artist.delete({ where: { id: artistId } });
  });

  it("creates a session and returns the linked artistId for correct credentials", async () => {
    const result = await loginArtist({ email, password });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.artistId).toBe(artistId);

    const session = await prisma.session.findUnique({
      where: { id: result.sessionId },
    });
    expect(session).not.toBeNull();
  });

  it("rejects an incorrect password without creating a session", async () => {
    const result = await loginArtist({ email, password: "wrong password" });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects an email with no matching account", async () => {
    const result = await loginArtist({
      email: "no-such-account@example.com",
      password,
    });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
  });

  it("rejects a non-ARTIST account even with the correct password", async () => {
    const clientProfileId = randomUUID();
    await prisma.clientProfile.create({
      data: {
        id: clientProfileId,
        instagramHandle: `test_client_${clientProfileId.slice(0, 8)}`,
        email: `${clientProfileId}@example.com`,
      },
    });
    const clientEmail = `${clientProfileId}-account@example.com`;
    await prisma.account.create({
      data: {
        email: clientEmail,
        passwordHash: await hashPassword(password),
        role: "CLIENT",
        clientProfileId,
      },
    });

    const result = await loginArtist({ email: clientEmail, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });

    const wrongRoleAccount = await prisma.account.findUnique({ where: { email: clientEmail } });
    expect(wrongRoleAccount?.failedLoginAttempts).toBe(0);

    await prisma.account.delete({ where: { email: clientEmail } });
    await prisma.clientProfile.delete({ where: { id: clientProfileId } });
  });

  it("rejects a locked account even with the correct password, without calling verifyPassword", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() + 60_000) },
    });

    const result = await loginArtist({ email, password });

    expect(result).toEqual({
      success: false,
      error: INVALID_CREDENTIALS_ERROR_MESSAGE,
    });
    expect(verifyPasswordModule.verifyPassword).not.toHaveBeenCalled();

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(account?.lockedUntil).not.toBeNull();
  });

  it("logs in and resets the counter once a lockout has naturally expired", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS, lockedUntil: new Date(Date.now() - 1000) },
    });

    const result = await loginArtist({ email, password });

    expect(result.success).toBe(true);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });

  it("increments the failed-attempt counter on a wrong password", async () => {
    await loginArtist({ email, password: "wrong password" });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(1);
  });

  it("locks the account when a wrong password hits MAX_FAILED_LOGIN_ATTEMPTS", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: MAX_FAILED_LOGIN_ATTEMPTS - 1, lockedUntil: null },
    });

    await loginArtist({ email, password: "wrong password" });

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(MAX_FAILED_LOGIN_ATTEMPTS);
    expect(account?.lockedUntil).not.toBeNull();
    expect(account?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it("resets the counter on a successful login after prior failures", async () => {
    await prisma.account.update({
      where: { email },
      data: { failedLoginAttempts: 3, lockedUntil: null },
    });

    const result = await loginArtist({ email, password });

    expect(result.success).toBe(true);

    const account = await prisma.account.findUnique({ where: { email } });
    expect(account?.failedLoginAttempts).toBe(0);
    expect(account?.lockedUntil).toBeNull();
  });
});
