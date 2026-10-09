import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import {
  ARTIST_ACCOUNT_SET_UP_CLIENT_PROFILE_MESSAGE,
  ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE,
  BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  SESSION_DURATION_MS,
  VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { RecordAuditEventInput } from "../types";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { recordAuditEvent } from "./recordAuditEvent";
import { verifyEmailOtpAndProvisionClient } from "./verifyEmailOtpAndProvisionClient";

// Mocked-Prisma unit test (architecture.md Sec7). checkEmailOtpCode and
// createSession run for real against the mocks, so each rejected-code case
// genuinely differs. $transaction hands the callback a separate mock per
// transaction kind, so three clients stay distinguishable: the challenge
// read and attempt reservation (global client), the account/profile
// resolve reads (REPEATABLE READ snapshot, 54.9.2.1), and the consume plus
// provisioning writes (default-isolation transaction). The real-DB race
// and rollback proofs are 54.5.2.6.
vi.mock("./recordAuditEvent", () => ({ recordAuditEvent: vi.fn() }));

const readTxMock = mockDeep<Prisma.TransactionClient>();
const txMock = mockDeep<Prisma.TransactionClient>();

const NOW = new Date("2026-01-01T00:00:00.000Z");
const SESSION_EXPIRES_AT = new Date(NOW.getTime() + SESSION_DURATION_MS);
const EMAIL = "client@example.com";
const HANDLE = "nail.client_1";
const CODE = "042517";
const CODE_HASH = hashEmailVerificationCode(CODE);

const INVALID = { success: false, error: INVALID_EMAIL_OTP_ERROR_MESSAGE };
const DB_ERROR = { success: false, error: VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE };

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge_1",
    email: EMAIL,
    purpose: "BOOKING_SUBMISSION",
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

function givenExistingClient(): void {
  readTxMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", "client_profile_1"));
}

// No account; an unlinked ClientProfile already has this email.
function givenUnlinkedProfile(): void {
  readTxMock.account.findUnique.mockResolvedValue(null);
  readTxMock.clientProfile.findUnique.mockResolvedValueOnce({
    id: "client_profile_1",
    account: null,
  } as never);
}

// No account, no profile with this email, handle free.
function givenNewClient(): void {
  readTxMock.account.findUnique.mockResolvedValue(null);
  readTxMock.clientProfile.findUnique.mockResolvedValue(null);
}

function uniqueConflict(): Prisma.PrismaClientKnownRequestError {
  // The message echoes PII, so the log assertions prove it's never logged.
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed for ${EMAIL} / ${HANDLE}`,
    { code: "P2002", clientVersion: "test" }
  );
}

function expectAudit(input: Omit<RecordAuditEventInput, "eventType">): void {
  expect(recordAuditEvent).toHaveBeenCalledTimes(1);
  expect(recordAuditEvent).toHaveBeenCalledWith({
    eventType: "EMAIL_OTP_BOOKING_VERIFICATION",
    ...input,
  });
}

function expectNoProvisioningWrites(): void {
  expect(txMock.account.create).not.toHaveBeenCalled();
  expect(txMock.clientProfile.create).not.toHaveBeenCalled();
  expect(txMock.session.create).not.toHaveBeenCalled();
  expect(prismaMock.account.create).not.toHaveBeenCalled();
  expect(prismaMock.account.update).not.toHaveBeenCalled();
  expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
  expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
  expect(prismaMock.session.create).not.toHaveBeenCalled();
}

describe("verifyEmailOtpAndProvisionClient", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(recordAuditEvent).mockReset();
    mockReset(readTxMock);
    mockReset(txMock);
    prismaMock.$transaction.mockImplementation(
      ((
        callback: (tx: Prisma.TransactionClient) => unknown,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
      ) =>
        callback(
          options?.isolationLevel === Prisma.TransactionIsolationLevel.RepeatableRead
            ? readTxMock
            : txMock
        )) as PrismaClient["$transaction"]
    );
    txMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });
    txMock.clientProfile.create.mockResolvedValue({ id: "client_profile_new" } as never);
    txMock.account.create.mockResolvedValue({ id: "account_new" } as never);
    txMock.session.create.mockImplementation(
      ((args: { data: { accountId: string } }) =>
        Promise.resolve({
          id: "session_1",
          expiresAt: SESSION_EXPIRES_AT,
          createdAt: NOW,
          accountId: args.data.accountId,
          activeRole: "CLIENT",
        })) as never
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("signs an existing CLIENT account into a session, consuming the code in the same transaction", async () => {
    givenValidCode();
    givenExistingClient();

    const result = await verifyEmailOtpAndProvisionClient({
      email: "  Client@Example.COM ",
      code: CODE,
      instagramHandle: HANDLE,
    });

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
      expect.objectContaining({
        where: expect.objectContaining({ purpose: "BOOKING_SUBMISSION" }),
        data: { attempts: { increment: 1 } },
      })
    );
    expect(readTxMock.account.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
      select: { id: true, role: true, clientProfileId: true },
    });
    // The draft's handle is never consulted for an existing account.
    expect(readTxMock.clientProfile.findUnique).not.toHaveBeenCalled();
    expect(txMock.emailOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: { id: "challenge_1", codeHash: CODE_HASH },
      data: { codeHash: null, consumedAt: NOW },
    });
    expect(txMock.session.create).toHaveBeenCalledWith({
      data: { accountId: "account_1", activeRole: "CLIENT", expiresAt: SESSION_EXPIRES_AT },
    });
    // No provisioning, and emailVerifiedAt is never written (27.3.2.8).
    expect(txMock.account.create).not.toHaveBeenCalled();
    expect(txMock.account.update).not.toHaveBeenCalled();
    expect(txMock.account.updateMany).not.toHaveBeenCalled();
    expect(txMock.clientProfile.create).not.toHaveBeenCalled();
    expect(prismaMock.account.update).not.toHaveBeenCalled();
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expectAudit({ outcome: "SUCCESS", reasonCode: "SIGNED_IN_WITH_EMAIL_OTP", accountId: "account_1" });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("creates a passwordless, verified CLIENT account linked to the unlinked profile with this email", async () => {
    givenValidCode();
    givenUnlinkedProfile();

    const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

    expect(result).toEqual({
      success: true,
      sessionId: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      clientProfileId: "client_profile_1",
    });
    expect(readTxMock.clientProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(readTxMock.clientProfile.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
      select: { id: true, account: { select: { id: true } } },
    });
    expect(txMock.clientProfile.create).not.toHaveBeenCalled();
    expect(txMock.account.create).toHaveBeenCalledWith({
      data: { email: EMAIL, role: "CLIENT", emailVerifiedAt: NOW, clientProfileId: "client_profile_1" },
      select: { id: true },
    });
    expect(txMock.account.create.mock.calls[0][0].data).not.toHaveProperty("passwordHash");
    expect(txMock.session.create).toHaveBeenCalledWith({
      data: { accountId: "account_new", activeRole: "CLIENT", expiresAt: SESSION_EXPIRES_AT },
    });
    // The profile's existing fields (incl. its handle) are left untouched.
    expect(txMock.clientProfile.update).not.toHaveBeenCalled();
    expectAudit({
      outcome: "SUCCESS",
      reasonCode: "CLIENT_ACCOUNT_LINKED_TO_EXISTING_PROFILE",
      accountId: "account_new",
    });
  });

  it("creates a new ClientProfile and CLIENT account when neither the email nor the handle is taken", async () => {
    givenValidCode();
    givenNewClient();

    const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

    expect(result).toEqual({
      success: true,
      sessionId: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      clientProfileId: "client_profile_new",
    });
    expect(readTxMock.clientProfile.findUnique).toHaveBeenNthCalledWith(1, {
      where: { email: EMAIL },
      select: { id: true, account: { select: { id: true } } },
    });
    expect(readTxMock.clientProfile.findUnique).toHaveBeenNthCalledWith(2, {
      where: { instagramHandle: HANDLE },
      select: { id: true },
    });
    expect(txMock.clientProfile.create).toHaveBeenCalledWith({
      data: { instagramHandle: HANDLE, email: EMAIL },
      select: { id: true },
    });
    expect(txMock.account.create).toHaveBeenCalledWith({
      data: { email: EMAIL, role: "CLIENT", emailVerifiedAt: NOW, clientProfileId: "client_profile_new" },
      select: { id: true },
    });
    expect(txMock.session.create).toHaveBeenCalledWith({
      data: { accountId: "account_new", activeRole: "CLIENT", expiresAt: SESSION_EXPIRES_AT },
    });
    // The consume is the transaction's first write.
    expect(txMock.emailOtpChallenge.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      txMock.clientProfile.create.mock.invocationCallOrder[0]
    );
    expectAudit({
      outcome: "SUCCESS",
      reasonCode: "CLIENT_ACCOUNT_AND_PROFILE_CREATED",
      accountId: "account_new",
    });
  });

  // 54.9.2.1: split reads let a double-verify loser see the winner's
  // commit halfway through and report a false "email unavailable".
  it.each([
    ["an existing CLIENT account", givenExistingClient],
    ["an unlinked profile", givenUnlinkedProfile],
    ["a new client", givenNewClient],
  ])(
    "resolves %s from one read-only REPEATABLE READ snapshot, before a default-isolation consume",
    async (_label, arrange) => {
      givenValidCode();
      arrange();

      const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

      expect(result).toMatchObject({ success: true });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
      const [readCall, consumeCall] = prismaMock.$transaction.mock.calls;
      expect(readCall[1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      expect(consumeCall[1]).toBeUndefined();
      // Every resolve read goes through the snapshot -- none through the
      // global client or the consume transaction.
      expect(readTxMock.account.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.clientProfile.findUnique).not.toHaveBeenCalled();
      expect(txMock.account.findUnique).not.toHaveBeenCalled();
      expect(txMock.clientProfile.findUnique).not.toHaveBeenCalled();
      // The snapshot never writes.
      expect(readTxMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
      expect(readTxMock.account.create).not.toHaveBeenCalled();
      expect(readTxMock.clientProfile.create).not.toHaveBeenCalled();
      expect(readTxMock.session.create).not.toHaveBeenCalled();
      expect(readTxMock.account.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
        txMock.emailOtpChallenge.updateMany.mock.invocationCallOrder[0]
      );
    }
  );

  it.each([
    ["a wrong code", challengeRow(), "999999"],
    ["an expired code", challengeRow({ expiresAt: NOW }), CODE],
    ["a consumed code", challengeRow({ codeHash: null, consumedAt: NOW }), CODE],
    ["a code at the attempt cap", challengeRow({ attempts: MAX_EMAIL_VERIFICATION_ATTEMPTS }), CODE],
    ["a code issued for client sign-in", challengeRow({ purpose: "CLIENT_SIGN_IN" }), CODE],
    ["no challenge for the email", null, CODE],
  ])("rejects %s without reading account state or opening a transaction", async (_label, challenge, code) => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValue(challenge);
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code, instagramHandle: HANDLE });

    expect(result).toEqual(INVALID);
    // Not even the read snapshot opens.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(readTxMock.account.findUnique).not.toHaveBeenCalled();
    expect(readTxMock.clientProfile.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.account.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.findUnique).not.toHaveBeenCalled();
    expectNoProvisioningWrites();
    expectAudit({ outcome: "REJECTED", reasonCode: "INVALID_EMAIL_OTP", attemptedEmail: EMAIL });
  });

  it.each([
    [
      "a dual-role ARTIST-home account",
      () => readTxMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", "client_profile_1")),
      ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE,
      { reasonCode: "ROLE_MISMATCH", accountId: "account_1" },
    ],
    [
      "an artist-only account",
      () => readTxMock.account.findUnique.mockResolvedValue(accountRow("ARTIST", null)),
      ARTIST_ACCOUNT_SET_UP_CLIENT_PROFILE_MESSAGE,
      { reasonCode: "ROLE_MISMATCH", accountId: "account_1" },
    ],
    [
      "a CLIENT account with no linked profile",
      () => readTxMock.account.findUnique.mockResolvedValue(accountRow("CLIENT", null)),
      BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
      { reasonCode: "NOT_LINKED_TO_CLIENT", accountId: "account_1" },
    ],
    [
      "a profile with this email linked to another account",
      () => {
        readTxMock.account.findUnique.mockResolvedValue(null);
        readTxMock.clientProfile.findUnique.mockResolvedValueOnce({
          id: "client_profile_1",
          account: { id: "account_other" },
        } as never);
      },
      BOOKING_EMAIL_UNAVAILABLE_ERROR_MESSAGE,
      { reasonCode: "CLIENT_PROFILE_ALREADY_LINKED", attemptedEmail: EMAIL },
    ],
    [
      "a new client whose handle belongs to another profile",
      () => {
        readTxMock.account.findUnique.mockResolvedValue(null);
        readTxMock.clientProfile.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: "client_profile_other" } as never);
      },
      INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
      { reasonCode: "INSTAGRAM_HANDLE_TAKEN", attemptedEmail: EMAIL },
    ],
  ] as const)(
    "rejects a valid code for %s with its post-proof message, leaving the code unconsumed",
    async (_label, arrange, error, audit) => {
      givenValidCode();
      arrange();

      const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

      expect(result).toEqual({ success: false, error });
      // Only the attempt reservation -- no consume, on any client. The read
      // snapshot is the only transaction that opens.
      expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      });
      expect(readTxMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
      expect(txMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
      expectNoProvisioningWrites();
      expectAudit({ outcome: "REJECTED", ...audit });
    }
  );

  it.each([
    ["an existing CLIENT account", givenExistingClient, { accountId: "account_1" }],
    ["a new client", givenNewClient, { attemptedEmail: EMAIL }],
  ])(
    "provisions nothing for %s when a concurrent verify already consumed the code",
    async (_label, arrange, identity) => {
      givenValidCode();
      arrange();
      txMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });

      const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

      expect(result).toEqual(INVALID);
      expectNoProvisioningWrites();
      expectAudit({ outcome: "REJECTED", reasonCode: "INVALID_EMAIL_OTP", ...identity });
    }
  );

  it.each([
    ["the account insert for a new client", givenNewClient, () => txMock.account.create],
    ["the profile insert for a new client", givenNewClient, () => txMock.clientProfile.create],
    ["the account insert when linking a profile", givenUnlinkedProfile, () => txMock.account.create],
  ])(
    "returns a generic retry error on a P2002 from %s, after consuming inside the rolled-back transaction",
    async (_label, arrange, write) => {
      givenValidCode();
      arrange();
      write().mockRejectedValue(uniqueConflict());

      const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

      expect(result).toEqual(DB_ERROR);
      // The consume ran on the transaction client, so it rolls back with
      // the failed write and the code stays redeemable.
      expect(txMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
      expect(txMock.session.create).not.toHaveBeenCalled();
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith({
        operation: "verifyEmailOtpAndProvisionClient",
        reason: "unique_conflict",
        errorCode: "P2002",
      });
      const logged = JSON.stringify(consoleErrorSpy.mock.calls);
      expect(logged).not.toContain(EMAIL);
      expect(logged).not.toContain(HANDLE);
      expect(logged).not.toContain(CODE);
    }
  );

  it.each([
    [
      "the challenge lookup",
      () => prismaMock.emailOtpChallenge.findUnique.mockRejectedValue(new Error(`P1001 for ${EMAIL}`)),
      undefined,
    ],
    [
      "opening the read snapshot",
      () => prismaMock.$transaction.mockRejectedValueOnce(new Error(`P1001 for ${EMAIL}`)),
      undefined,
    ],
    [
      "the account lookup",
      () => readTxMock.account.findUnique.mockRejectedValue(new Error(`P1001 for ${EMAIL}`)),
      undefined,
    ],
    [
      "the profile lookup",
      () => readTxMock.clientProfile.findUnique.mockRejectedValue(new Error(`P1001 for ${HANDLE}`)),
      undefined,
    ],
    [
      "the session insert inside the transaction",
      () =>
        txMock.session.create.mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError(`FK failed for ${EMAIL} code ${CODE}`, {
            code: "P2003",
            clientVersion: "test",
          })
        ),
      "P2003",
    ],
  ])(
    "returns a generic retry error and logs only a fixed reason when %s throws",
    async (_label, arrange, errorCode) => {
      givenValidCode();
      givenNewClient();
      arrange();

      const result = await verifyEmailOtpAndProvisionClient({ email: EMAIL, code: CODE, instagramHandle: HANDLE });

      expect(result).toEqual(DB_ERROR);
      expect(recordAuditEvent).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0]).toStrictEqual([
        { operation: "verifyEmailOtpAndProvisionClient", reason: "unexpected_failure", errorCode },
      ]);
      const logged = JSON.stringify(consoleErrorSpy.mock.calls);
      expect(logged).not.toContain(EMAIL);
      expect(logged).not.toContain(HANDLE);
      expect(logged).not.toContain(CODE);
    }
  );
});
