import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE,
  SESSION_DURATION_MS,
} from "../constants";
import type { RecordAuditEventInput } from "../types";
import { hashPassword } from "./hashPassword";
import { hashPasswordResetToken } from "./hashPasswordResetToken";
import { recordAuditEvent } from "./recordAuditEvent";
import { resetArtistPassword } from "./resetArtistPassword";

// Mocked-Prisma unit test (architecture.md Sec7). createSession and
// hashPasswordResetToken run for real; hashPassword is mocked so the test
// can prove scrypt never runs on a rejected link. $transaction hands the
// callback a separate tx mock, so the lookup (global client) is
// distinguishable from the reset's writes (transaction client).
vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("./hashPassword", () => ({ hashPassword: vi.fn() }));

const txMock = mockDeep<Prisma.TransactionClient>();

const NOW = new Date("2026-01-01T00:00:00.000Z");
const SESSION_EXPIRES_AT = new Date(NOW.getTime() + SESSION_DURATION_MS);
const ACCOUNT_ID = "account_1";
const LINK_ID = "reset_token_1";
const TOKEN = "q7Lm0x-Rt2_Vb9KcWn4YpZs8eHd3JfAg6uTiOy1BvNk";
const TOKEN_HASH = hashPasswordResetToken(TOKEN);
const NEW_PASSWORD = "correct horse battery staple";
const NEW_PASSWORD_HASH = "salt_hex:derived_key_hex";

const INVALID = { success: false, error: INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE };
const DB_ERROR = { success: false, error: RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE };

function linkRow(
  overrides: { expiresAt?: Date; role?: "ARTIST" | "CLIENT"; artistId?: string | null } = {}
) {
  return {
    id: LINK_ID,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 60_000),
    account: {
      id: ACCOUNT_ID,
      role: overrides.role ?? "ARTIST",
      artistId: overrides.artistId === undefined ? "artist_1" : overrides.artistId,
    },
  } as never;
}

function reset() {
  return resetArtistPassword({ token: TOKEN, newPassword: NEW_PASSWORD });
}

function expectAudit(input: Omit<RecordAuditEventInput, "eventType">): void {
  expect(recordAuditEvent).toHaveBeenCalledTimes(1);
  expect(recordAuditEvent).toHaveBeenCalledWith({ eventType: "PASSWORD_RESET", ...input });
}

function expectNoResetWrites(): void {
  expect(txMock.session.deleteMany).not.toHaveBeenCalled();
  expect(txMock.session.create).not.toHaveBeenCalled();
  expect(prismaMock.session.create).not.toHaveBeenCalled();
  expect(prismaMock.account.update).not.toHaveBeenCalled();
  expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
}

function loggedText(spy: MockInstance<typeof console.error>): string {
  return JSON.stringify(spy.mock.calls);
}

describe("resetArtistPassword", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordAuditEvent).mockReset();
    vi.mocked(hashPassword).mockReset();
    vi.mocked(hashPassword).mockResolvedValue(NEW_PASSWORD_HASH);
    mockReset(txMock);
    prismaMock.$transaction.mockImplementation(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(linkRow());
    txMock.account.updateMany.mockResolvedValue({ count: 1 });
    txMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 1 });
    txMock.session.deleteMany.mockResolvedValue({ count: 2 });
    txMock.session.create.mockResolvedValue({
      id: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      createdAt: NOW,
      accountId: ACCOUNT_ID,
      activeRole: "ARTIST",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("sets the password, clears the lock, deletes every link and session, and signs the artist in", async () => {
    const result = await reset();

    expect(result).toEqual({
      success: true,
      sessionId: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      artistId: "artist_1",
    });
    // Looked up by hash -- the raw token never reaches the DB.
    expect(prismaMock.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: TOKEN_HASH },
      select: {
        id: true,
        expiresAt: true,
        account: { select: { id: true, role: true, artistId: true } },
      },
    });
    expect(JSON.stringify(prismaMock.passwordResetToken.findUnique.mock.calls)).not.toContain(TOKEN);
    expect(hashPassword).toHaveBeenCalledWith(NEW_PASSWORD);

    expect(txMock.account.updateMany).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { passwordHash: NEW_PASSWORD_HASH, failedLoginAttempts: 0, lockedUntil: null },
    });
    expect(txMock.passwordResetToken.deleteMany).toHaveBeenCalledTimes(2);
    expect(txMock.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: LINK_ID, expiresAt: { gt: NOW } },
    });
    expect(txMock.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { accountId: ACCOUNT_ID },
    });
    expect(txMock.session.deleteMany).toHaveBeenCalledWith({ where: { accountId: ACCOUNT_ID } });
    expect(txMock.session.create).toHaveBeenCalledWith({
      data: { accountId: ACCOUNT_ID, activeRole: "ARTIST", expiresAt: SESSION_EXPIRES_AT },
    });

    // scrypt runs before the transaction opens, and the Account update is
    // its first statement (it waits on an in-flight issue's row lock).
    const order = [
      vi.mocked(hashPassword).mock.invocationCallOrder[0],
      prismaMock.$transaction.mock.invocationCallOrder[0],
      txMock.account.updateMany.mock.invocationCallOrder[0],
      txMock.passwordResetToken.deleteMany.mock.invocationCallOrder[0],
      txMock.passwordResetToken.deleteMany.mock.invocationCallOrder[1],
      txMock.session.deleteMany.mock.invocationCallOrder[0],
      txMock.session.create.mock.invocationCallOrder[0],
      vi.mocked(recordAuditEvent).mock.invocationCallOrder[0],
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }

    // Every write goes through the transaction client.
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.session.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expectAudit({ outcome: "SUCCESS", reasonCode: "PASSWORD_RESET_WITH_EMAIL_LINK", accountId: ACCOUNT_ID });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("judges the guarded delete on a fresh clock, so a link that expires during scrypt is rejected", async () => {
    const afterScrypt = new Date(NOW.getTime() + 1_000);
    vi.mocked(hashPassword).mockImplementation(async () => {
      vi.setSystemTime(afterScrypt);
      return NEW_PASSWORD_HASH;
    });

    await reset();

    expect(txMock.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { id: LINK_ID, expiresAt: { gt: afterScrypt } },
    });
  });

  it.each([
    ["an unknown link", null],
    // Live means expiresAt > now, so a link expiring exactly now is dead.
    ["a link expiring exactly now", linkRow({ expiresAt: NOW })],
    ["an expired link", linkRow({ expiresAt: new Date(NOW.getTime() - 1) })],
  ])("rejects %s without running scrypt, opening a transaction or auditing", async (_label, link) => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(link);

    const result = await reset();

    expect(result).toEqual(INVALID);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expectNoResetWrites();
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a CLIENT account", linkRow({ role: "CLIENT", artistId: null }), "ROLE_MISMATCH"],
    ["an ARTIST account with no linked Artist", linkRow({ artistId: null }), "NOT_LINKED_TO_ARTIST"],
  ] as const)(
    "rejects a live link for %s with a REJECTED audit row and no reset",
    async (_label, link, reasonCode) => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(link);

      const result = await reset();

      expect(result).toEqual(INVALID);
      expect(hashPassword).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
      expectNoResetWrites();
      expectAudit({ outcome: "REJECTED", reasonCode, accountId: ACCOUNT_ID });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["a concurrent reset already used the link", 1],
    ["the account was deleted mid-reset", 0],
  ])("rolls the password write back when %s", async (_label, accountsUpdated) => {
    txMock.account.updateMany.mockResolvedValue({ count: accountsUpdated });
    txMock.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 0 });

    const result = await reset();

    expect(result).toEqual(INVALID);
    // The callback threw rather than returned -- returning would commit the
    // password write that already ran.
    await expect(prismaMock.$transaction.mock.results[0]?.value).rejects.toBeInstanceOf(Error);
    expect(txMock.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
    expectNoResetWrites();
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the link lookup",
      () =>
        prismaMock.passwordResetToken.findUnique.mockRejectedValue(new Error(`P1001 for ${TOKEN_HASH}`)),
      undefined,
      undefined,
    ],
    [
      "hashing the new password",
      () => vi.mocked(hashPassword).mockRejectedValue(new Error(`scrypt failed for ${NEW_PASSWORD}`)),
      ACCOUNT_ID,
      undefined,
    ],
    [
      "the Account update inside the transaction",
      () =>
        txMock.account.updateMany.mockRejectedValue(
          new Error(`update failed setting ${NEW_PASSWORD_HASH}`)
        ),
      ACCOUNT_ID,
      undefined,
    ],
    [
      "the session insert inside the transaction",
      () =>
        txMock.session.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(`Write conflict for ${TOKEN}`, {
            code: "P2034",
            clientVersion: "test",
          })
        ),
      ACCOUNT_ID,
      "P2034",
    ],
  ])(
    "returns the retry error and logs only the allowlist when %s throws",
    async (_label, arrange, accountId, errorCode) => {
      arrange();

      const result = await reset();

      expect(result).toEqual(DB_ERROR);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "resetArtistPassword",
        reason: "unexpected_failure",
        accountId,
        errorCode,
      });
      expect(loggedText(consoleErrorSpy)).not.toContain(TOKEN);
      expect(loggedText(consoleErrorSpy)).not.toContain(TOKEN_HASH);
      expect(loggedText(consoleErrorSpy)).not.toContain(NEW_PASSWORD);
      expect(loggedText(consoleErrorSpy)).not.toContain(NEW_PASSWORD_HASH);
    }
  );
});
