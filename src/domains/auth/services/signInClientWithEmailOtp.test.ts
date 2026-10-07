import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import {
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  SESSION_DURATION_MS,
  SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { RecordAuditEventInput } from "../types";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { recordAuditEvent } from "./recordAuditEvent";
import { signInClientWithEmailOtp } from "./signInClientWithEmailOtp";

// Mocked-Prisma unit test (architecture.md Sec7). checkEmailOtpCode and
// createSession run for real against the mocks, so each rejected-code case
// genuinely differs. $transaction hands the callback a separate tx mock, so
// the reservation (global client) is distinguishable from the consume and
// the session insert (transaction client).
vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

const txMock = mockDeep<Prisma.TransactionClient>();

const NOW = new Date("2026-01-01T00:00:00.000Z");
const SESSION_EXPIRES_AT = new Date(NOW.getTime() + SESSION_DURATION_MS);
const EMAIL = "client@example.com";
const CODE = "042517";
const CODE_HASH = hashEmailVerificationCode(CODE);

const INVALID = { success: false, error: INVALID_EMAIL_OTP_ERROR_MESSAGE };
const DB_ERROR = { success: false, error: SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE };

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge_1",
    email: EMAIL,
    purpose: "CLIENT_SIGN_IN",
    codeHash: CODE_HASH,
    expiresAt: new Date(NOW.getTime() + 60_000),
    attempts: 0,
    sentAt: new Date(NOW.getTime() - 60_000),
    consumedAt: null,
    windowStartedAt: new Date(NOW.getTime() - 60_000),
    windowSendCount: 1,
    createdAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  } as never;
}

function accountRow(role: "ARTIST" | "CLIENT", clientProfileId: string | null) {
  return { id: "account_1", role, clientProfileId } as never;
}

function givenValidCode(): void {
  prismaMock.emailOtpChallenge.findUnique.mockResolvedValue(challengeRow());
  prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });
}

function givenEligibleAccount(): void {
  prismaMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", "client_profile_1"));
}

function expectAudit(input: Omit<RecordAuditEventInput, "eventType">): void {
  expect(recordAuditEvent).toHaveBeenCalledTimes(1);
  expect(recordAuditEvent).toHaveBeenCalledWith({ eventType: "EMAIL_OTP_SIGN_IN", ...input });
}

describe("signInClientWithEmailOtp", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordAuditEvent).mockReset();
    mockReset(txMock);
    prismaMock.$transaction.mockImplementation(
      ((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback(txMock)) as PrismaClient["$transaction"]
    );
    txMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });
    txMock.session.create.mockResolvedValue({
      id: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      createdAt: NOW,
      accountId: "account_1",
      activeRole: "CLIENT",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("consumes the code and creates a CLIENT session in one transaction for an eligible account", async () => {
    givenValidCode();
    givenEligibleAccount();

    const result = await signInClientWithEmailOtp({ email: "  Client@Example.COM ", code: CODE });

    expect(result).toEqual({
      success: true,
      sessionId: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      clientProfileId: "client_profile_1",
    });
    expect(prismaMock.emailOtpChallenge.findUnique).toHaveBeenCalledWith({ where: { email: EMAIL } });
    // The attempt is reserved on the global client, outside the transaction.
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
    expect(prismaMock.account.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
      select: { id: true, role: true, clientProfileId: true },
    });
    expect(txMock.emailOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: "challenge_1", codeHash: CODE_HASH },
      data: { codeHash: null, consumedAt: NOW },
    });
    expect(txMock.session.create).toHaveBeenCalledWith({
      data: { accountId: "account_1", activeRole: "CLIENT", expiresAt: SESSION_EXPIRES_AT },
    });
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    // emailVerifiedAt is never written (27.3.2.8).
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
    expect(txMock.account.update).not.toHaveBeenCalled();
    expect(txMock.account.updateMany).not.toHaveBeenCalled();
    expectAudit({ outcome: "SUCCESS", reasonCode: "SIGNED_IN_WITH_EMAIL_OTP", accountId: "account_1" });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong code", challengeRow(), "999999"],
    ["an expired code", challengeRow({ expiresAt: NOW }), CODE],
    ["a consumed code", challengeRow({ codeHash: null, consumedAt: NOW }), CODE],
    ["a code at the attempt cap", challengeRow({ attempts: MAX_EMAIL_VERIFICATION_ATTEMPTS }), CODE],
    ["a code issued for booking submission", challengeRow({ purpose: "BOOKING_SUBMISSION" }), CODE],
    ["no challenge for the email", null, CODE],
  ])("rejects %s without looking up the account or opening a transaction", async (_label, challenge, code) => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValue(challenge);
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const result = await signInClientWithEmailOtp({ email: EMAIL, code });

    expect(result).toEqual(INVALID);
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.session.create).not.toHaveBeenCalled();
    expectAudit({ outcome: "REJECTED", reasonCode: "INVALID_EMAIL_OTP", attemptedEmail: EMAIL });
  });

  it.each([
    ["no account", null, { reasonCode: "ACCOUNT_NOT_FOUND", attemptedEmail: EMAIL }],
    [
      "a dual-role ARTIST-home account",
      accountRow("ARTIST", "client_profile_1"),
      { reasonCode: "ROLE_MISMATCH", accountId: "account_1" },
    ],
    ["an artist-only account", accountRow("ARTIST", null), { reasonCode: "ROLE_MISMATCH", accountId: "account_1" }],
    [
      "a CLIENT account with no linked profile",
      accountRow("CLIENT", null),
      { reasonCode: "NOT_LINKED_TO_CLIENT", accountId: "account_1" },
    ],
  ] as const)(
    "rejects a valid code for %s without consuming it or creating a session",
    async (_label, account, audit) => {
      givenValidCode();
      prismaMock.account.findUnique.mockResolvedValue(account);

      const result = await signInClientWithEmailOtp({ email: EMAIL, code: CODE });

      expect(result).toEqual(INVALID);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(txMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
      expect(txMock.session.create).not.toHaveBeenCalled();
      expect(prismaMock.session.create).not.toHaveBeenCalled();
      expectAudit({ outcome: "REJECTED", ...audit });
    }
  );

  it("creates no session when a concurrent verify already consumed the code", async () => {
    givenValidCode();
    givenEligibleAccount();
    txMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });

    const result = await signInClientWithEmailOtp({ email: EMAIL, code: CODE });

    expect(result).toEqual(INVALID);
    expect(txMock.session.create).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expectAudit({ outcome: "REJECTED", reasonCode: "INVALID_EMAIL_OTP", accountId: "account_1" });
  });

  it.each([
    [
      "the challenge lookup",
      () => prismaMock.emailOtpChallenge.findUnique.mockRejectedValue(new Error(`P1001 for ${EMAIL}`)),
    ],
    [
      "the account lookup",
      () => prismaMock.account.findUnique.mockRejectedValue(new Error(`P1001 for ${EMAIL}`)),
    ],
    [
      "the session insert inside the transaction",
      () => txMock.session.create.mockRejectedValue(new Error(`P2003 for ${EMAIL} code ${CODE}`)),
    ],
  ])("returns a generic error and logs only a fixed reason when %s throws", async (_label, arrange) => {
    givenValidCode();
    givenEligibleAccount();
    arrange();

    const result = await signInClientWithEmailOtp({ email: EMAIL, code: CODE });

    expect(result).toEqual(DB_ERROR);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith({
      operation: "signInClientWithEmailOtp",
      reason: "unexpected_failure",
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(EMAIL);
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(CODE);
  });
});
