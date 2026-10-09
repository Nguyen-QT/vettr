import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Account, Session } from "@/generated/prisma/client";

import { getSessionWithAccount } from "./getSessionWithAccount";

// Mocked-Prisma unit test (architecture.md §7): stub findUnique's joined row
// and pin the clock so the expiry boundary is deterministic.
const NOW = new Date("2026-03-01T12:00:00.000Z");

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    email: "account-1@example.com",
    passwordHash: "irrelevant-for-this-test",
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

function buildSessionWithAccount(
  expiresAt: Date
): Session & { account: Account } {
  return {
    id: "session-1",
    expiresAt,
    createdAt: NOW,
    accountId: "account-1",
    activeRole: "ARTIST",
    account: buildAccount(),
  };
}

describe("getSessionWithAccount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the session and linked account details for a valid session", async () => {
    const expiresAt = new Date(NOW.getTime() + 60_000);
    prismaMock.session.findUnique.mockResolvedValue(
      buildSessionWithAccount(expiresAt)
    );

    const result = await getSessionWithAccount("session-1");

    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: { id: "session-1" },
      include: { account: true },
    });
    expect(result).toEqual({
      sessionId: "session-1",
      expiresAt,
      accountId: "account-1",
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: null,
    });
  });

  it("returns null for an expired session", async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      buildSessionWithAccount(new Date(NOW.getTime() - 60_000))
    );

    await expect(getSessionWithAccount("session-1")).resolves.toBeNull();
  });

  it("returns null for a session expiring exactly now", async () => {
    prismaMock.session.findUnique.mockResolvedValue(
      buildSessionWithAccount(new Date(NOW.getTime()))
    );

    await expect(getSessionWithAccount("session-1")).resolves.toBeNull();
  });

  it("returns null for a session id that does not exist", async () => {
    prismaMock.session.findUnique.mockResolvedValue(null);

    await expect(getSessionWithAccount("missing")).resolves.toBeNull();
  });
});
