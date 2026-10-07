import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { MAX_EMAIL_VERIFICATION_ATTEMPTS } from "../constants";
import type { EmailOtpPurposeValue } from "../types";
import { checkEmailOtpCode } from "./checkEmailOtpCode";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "client@example.com";
const CODE = "042517";
const CODE_HASH = hashEmailVerificationCode(CODE);
const PURPOSE: EmailOtpPurposeValue = "CLIENT_SIGN_IN";

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge_1",
    email: EMAIL,
    purpose: PURPOSE,
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

const INVALID = { valid: false };

describe("checkEmailOtpCode", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it("reserves an attempt and returns the consume guard for the correct code, without consuming it", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(challengeRow());
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual({ valid: true, challengeId: "challenge_1", codeHash: CODE_HASH });
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: "challenge_1",
        codeHash: CODE_HASH,
        purpose: PURPOSE,
        expiresAt: { gt: NOW },
        attempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
  });

  it("looks the challenge up by the normalised email", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(null);

    await checkEmailOtpCode({ email: "  Client@Example.COM ", purpose: PURPOSE, code: CODE });

    expect(prismaMock.emailOtpChallenge.findUnique).toHaveBeenCalledWith({
      where: { email: EMAIL },
    });
  });

  it("matches a code with leading zeros", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(challengeRow());
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: "042517" });

    expect(result.valid).toBe(true);
  });

  it("accepts the correct code on the last allowed attempt", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ attempts: MAX_EMAIL_VERIFICATION_ATTEMPTS - 1 })
    );
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result.valid).toBe(true);
  });

  it("rejects a wrong code after counting the attempt, leaving an under-cap code alive", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(challengeRow());
    prismaMock.emailOtpChallenge.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: "999999" });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
    // The invalidation is guarded on the cap, so under it this is a no-op.
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ attempts: { gte: MAX_EMAIL_VERIFICATION_ATTEMPTS } }),
      })
    );
  });

  it("invalidates the code once a wrong guess reaches the attempt cap", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ attempts: MAX_EMAIL_VERIFICATION_ATTEMPTS - 1 })
    );
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: "999999" });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "challenge_1",
        codeHash: CODE_HASH,
        attempts: { gte: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { codeHash: null },
    });
  });

  it("rejects even the correct code once attempts are exhausted, without writing", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ attempts: MAX_EMAIL_VERIFICATION_ATTEMPTS })
    );

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an expired code without writing", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ expiresAt: new Date(NOW.getTime() - 1) })
    );

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a code that expires exactly now", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ expiresAt: NOW })
    );

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown email without writing", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(null);

    const result = await checkEmailOtpCode({
      email: "nobody@example.com",
      purpose: PURPOSE,
      code: CODE,
    });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a dead code (consumed or invalidated) without writing", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ codeHash: null, consumedAt: new Date(NOW.getTime() - 1000) })
    );

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
  });

  it.each<[EmailOtpPurposeValue, EmailOtpPurposeValue]>([
    ["CLIENT_SIGN_IN", "BOOKING_SUBMISSION"],
    ["BOOKING_SUBMISSION", "CLIENT_SIGN_IN"],
  ])(
    "rejects the correct code issued for %s when checked for %s, without burning an attempt",
    async (issuedFor, checkedFor) => {
      prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
        challengeRow({ purpose: issuedFor })
      );

      const result = await checkEmailOtpCode({ email: EMAIL, purpose: checkedFor, code: CODE });

      expect(result).toEqual(INVALID);
      expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
    }
  );

  it("rejects when the reservation loses to a concurrent guess, re-issue or consume", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(challengeRow());
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects without throwing when the stored hash is corrupted", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockResolvedValueOnce(
      challengeRow({ codeHash: "not-a-sha256-hex" })
    );
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 1 });

    const result = await checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE });

    expect(result).toEqual(INVALID);
  });

  it("propagates a DB failure to the caller without logging", async () => {
    prismaMock.emailOtpChallenge.findUnique.mockRejectedValueOnce(
      new Error(`connection lost for ${EMAIL} code ${CODE}`)
    );

    await expect(
      checkEmailOtpCode({ email: EMAIL, purpose: PURPOSE, code: CODE })
    ).rejects.toThrow("connection lost");
    expect(prismaMock.emailOtpChallenge.updateMany).not.toHaveBeenCalled();
    // The caller owns the generic error and the non-PII log.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
