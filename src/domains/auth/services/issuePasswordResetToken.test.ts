import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import {
  MAX_LIVE_PASSWORD_RESET_TOKENS,
  PASSWORD_RESET_REQUEST_COOLDOWN_MS,
  PASSWORD_RESET_TOKEN_EXPIRY_MS,
} from "../constants";
import type { IssuePasswordResetTokenResult } from "../types";
import { hashPasswordResetToken } from "./hashPasswordResetToken";
import { issuePasswordResetToken } from "./issuePasswordResetToken";

// Mocked-Prisma unit test (architecture.md Sec7). $transaction hands the
// callback a separate tx mock, so every read and write can be shown to run
// inside the transaction. The row lock itself (concurrent requests waiting
// on it) only runs against Postgres, in 71.1.2.5's integration test.
const txMock = mockDeep<Prisma.TransactionClient>();

const NOW = new Date("2026-01-01T00:00:00.000Z");
const ACCOUNT_ID = "account_1";
const COOLDOWN_CUTOFF = new Date(NOW.getTime() - PASSWORD_RESET_REQUEST_COOLDOWN_MS);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

// findMany selects createdAt only, newest first.
function givenLiveLinks(...createdAts: Date[]): void {
  txMock.passwordResetToken.findMany.mockResolvedValue(
    createdAts.map((createdAt) => ({ createdAt })) as never
  );
}

function issuedToken(result: IssuePasswordResetTokenResult): string {
  if (!result.issued) {
    throw new Error("expected a token to be issued");
  }
  return result.token;
}

// The SQL text (placeholders as "?", whitespace collapsed) and the values
// bound into the nth tagged-template $queryRaw call.
function rawQuery(callIndex: number): { sql: string; values: unknown[] } {
  const [strings, ...values] = txMock.$queryRaw.mock.calls[callIndex];
  const sql = Array.from(strings as TemplateStringsArray)
    .join("?")
    .replace(/\s+/g, " ")
    .trim();
  return { sql, values };
}

describe("issuePasswordResetToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockReset(txMock);
    prismaMock.$transaction.mockImplementation(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    txMock.$queryRaw.mockResolvedValue([{ id: ACCOUNT_ID }]);
    txMock.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    givenLiveLinks();
    txMock.passwordResetToken.create.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("issues a link inside one transaction when the account holds no live links", async () => {
    const result = await issuePasswordResetToken(ACCOUNT_ID);

    const token = issuedToken(result);
    expect(token).toMatch(TOKEN_PATTERN);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txMock.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        accountId: ACCOUNT_ID,
        // The emailed plaintext is the token whose hash was stored.
        tokenHash: hashPasswordResetToken(token),
        expiresAt: new Date(NOW.getTime() + PASSWORD_RESET_TOKEN_EXPIRY_MS),
        // Node's clock, not the column's DB-clock default.
        createdAt: NOW,
      },
    });
    const [[{ data }]] = txMock.passwordResetToken.create.mock.calls;
    expect(data.tokenHash).not.toBe(token);
    expect(prismaMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.passwordResetToken.findMany).not.toHaveBeenCalled();
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("locks the Account row before any other query", async () => {
    await issuePasswordResetToken(ACCOUNT_ID);

    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(rawQuery(0)).toEqual({
      sql: 'SELECT "id" FROM "Account" WHERE "id" = ? FOR UPDATE',
      values: [ACCOUNT_ID],
    });
    const [lockOrder] = txMock.$queryRaw.mock.invocationCallOrder;
    const [deleteOrder] = txMock.passwordResetToken.deleteMany.mock.invocationCallOrder;
    expect(lockOrder).toBeLessThan(deleteOrder);
  });

  it("deletes the account's expired links before counting the live ones", async () => {
    await issuePasswordResetToken(ACCOUNT_ID);

    expect(txMock.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID, expiresAt: { lte: NOW } },
    });
    expect(txMock.passwordResetToken.findMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_LIVE_PASSWORD_RESET_TOKENS,
    });
    const [deleteOrder] = txMock.passwordResetToken.deleteMany.mock.invocationCallOrder;
    const [findOrder] = txMock.passwordResetToken.findMany.mock.invocationCallOrder;
    expect(deleteOrder).toBeLessThan(findOrder);
  });

  it("issues nothing while the newest live link is inside the cooldown", async () => {
    givenLiveLinks(new Date(COOLDOWN_CUTOFF.getTime() + 1));

    const result = await issuePasswordResetToken(ACCOUNT_ID);

    expect(result).toEqual({ issued: false });
    expect(txMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("issues once the cooldown has exactly elapsed", async () => {
    givenLiveLinks(COOLDOWN_CUTOFF);

    const result = await issuePasswordResetToken(ACCOUNT_ID);

    expect(issuedToken(result)).toMatch(TOKEN_PATTERN);
    expect(txMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it("issues nothing once the live-link cap is reached, even past the cooldown", async () => {
    givenLiveLinks(minutesAgo(10), minutesAgo(20), minutesAgo(30));

    const result = await issuePasswordResetToken(ACCOUNT_ID);

    expect(result).toEqual({ issued: false });
    expect(txMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("issues while the account is one link below the cap and past the cooldown", async () => {
    givenLiveLinks(minutesAgo(10), minutesAgo(20));

    const result = await issuePasswordResetToken(ACCOUNT_ID);

    expect(issuedToken(result)).toMatch(TOKEN_PATTERN);
    expect(txMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it("issues nothing, and touches no links, when the account no longer exists", async () => {
    txMock.$queryRaw.mockResolvedValue([]);

    const result = await issuePasswordResetToken(ACCOUNT_ID);

    expect(result).toEqual({ issued: false });
    expect(txMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(txMock.passwordResetToken.findMany).not.toHaveBeenCalled();
    expect(txMock.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it("propagates a failed insert to the caller", async () => {
    txMock.passwordResetToken.create.mockRejectedValueOnce(new Error("connection lost"));

    await expect(issuePasswordResetToken(ACCOUNT_ID)).rejects.toThrow("connection lost");
  });

  it("propagates a failed row lock without running anything after it", async () => {
    txMock.$queryRaw.mockRejectedValueOnce(new Error("connection lost"));

    await expect(issuePasswordResetToken(ACCOUNT_ID)).rejects.toThrow("connection lost");
    expect(txMock.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(txMock.passwordResetToken.findMany).not.toHaveBeenCalled();
    expect(txMock.passwordResetToken.create).not.toHaveBeenCalled();
  });
});
