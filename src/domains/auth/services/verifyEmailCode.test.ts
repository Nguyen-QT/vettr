import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  INVALID_VERIFICATION_CODE_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import { createSession } from "./createSession";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { verifyEmailCode } from "./verifyEmailCode";

vi.mock("./createSession", () => ({ createSession: vi.fn() }));

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "client@example.com";
const CODE = "042517";
const CODE_HASH = hashEmailVerificationCode(CODE);
const SESSION_EXPIRES_AT = new Date("2026-01-31T00:00:00.000Z");

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "account_1",
    email: EMAIL,
    role: "CLIENT",
    clientProfileId: "profile_1",
    emailVerifiedAt: null,
    emailVerificationCodeHash: CODE_HASH,
    emailVerificationCodeExpiresAt: new Date(NOW.getTime() + 60_000),
    emailVerificationAttempts: 0,
    ...overrides,
  } as never;
}

const GENERIC_FAILURE = { success: false, error: INVALID_VERIFICATION_CODE_ERROR_MESSAGE };

describe("verifyEmailCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSession).mockReset();
    vi.mocked(createSession).mockResolvedValue({
      id: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("consumes the code and issues a session for the correct code", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow());
    prismaMock.account.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual({
      success: true,
      sessionId: "session_1",
      expiresAt: SESSION_EXPIRES_AT,
      clientProfileId: "profile_1",
    });
    expect(prismaMock.account.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "account_1",
        emailVerificationCodeHash: CODE_HASH,
        emailVerifiedAt: null,
        emailVerificationCodeExpiresAt: { gt: NOW },
        emailVerificationAttempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { emailVerificationAttempts: { increment: 1 } },
    });
    expect(prismaMock.account.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "account_1", emailVerificationCodeHash: CODE_HASH, emailVerifiedAt: null },
      data: {
        emailVerifiedAt: NOW,
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });
    expect(createSession).toHaveBeenCalledWith("account_1", "CLIENT");
  });

  it("matches a code with leading zeros", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow());
    prismaMock.account.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyEmailCode({ email: EMAIL, code: "042517" });

    expect(result.success).toBe(true);
  });

  it("rejects a wrong code, counts the attempt, and issues no session", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow());
    prismaMock.account.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyEmailCode({ email: EMAIL, code: "999999" });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(createSession).not.toHaveBeenCalled();
    expect(prismaMock.account.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { emailVerificationAttempts: { increment: 1 } } })
    );
  });

  it("invalidates the code once a wrong guess reaches the attempt cap", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerificationAttempts: MAX_EMAIL_VERIFICATION_ATTEMPTS - 1 })
    );
    prismaMock.account.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyEmailCode({ email: EMAIL, code: "999999" });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "account_1",
        emailVerificationCodeHash: CODE_HASH,
        emailVerificationAttempts: { gte: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { emailVerificationCodeHash: null, emailVerificationCodeExpiresAt: null },
    });
  });

  it("rejects even the correct code once attempts are exhausted, without writing", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerificationAttempts: MAX_EMAIL_VERIFICATION_ATTEMPTS })
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects an expired code without writing", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerificationCodeExpiresAt: new Date(NOW.getTime() - 1) })
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a code that expires exactly now", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerificationCodeExpiresAt: NOW })
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
  });

  it("rejects an already-verified account", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerifiedAt: new Date("2025-12-01T00:00:00.000Z") })
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown email with the same generic error", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(null);

    const result = await verifyEmailCode({ email: "nobody@example.com", code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an account with no outstanding code (invalidated or never issued)", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(
      accountRow({ emailVerificationCodeHash: null, emailVerificationCodeExpiresAt: null })
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
  });

  it("rejects a non-CLIENT account", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow({ role: "ARTIST" }));

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when a concurrent request wins the attempt reservation", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow());
    prismaMock.account.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(prismaMock.account.updateMany).toHaveBeenCalledTimes(1);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("issues no second session when a concurrent submit already consumed the code", async () => {
    prismaMock.account.findUnique.mockResolvedValueOnce(accountRow());
    prismaMock.account.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual(GENERIC_FAILURE);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns the unexpected-error message and logs no PII on a database failure", async () => {
    prismaMock.account.findUnique.mockRejectedValueOnce(
      new Error(`connection lost for ${EMAIL} code ${CODE}`)
    );

    const result = await verifyEmailCode({ email: EMAIL, code: CODE });

    expect(result).toEqual({ success: false, error: VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE });
    expect(consoleErrorSpy).toHaveBeenCalled();
    for (const call of consoleErrorSpy.mock.calls) {
      const logged = JSON.stringify(call);
      expect(logged).not.toContain(EMAIL);
      expect(logged).not.toContain(CODE);
      expect(logged).not.toContain("connection lost");
    }
  });
});
