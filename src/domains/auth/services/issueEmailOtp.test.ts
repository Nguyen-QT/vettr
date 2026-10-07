import { prismaMock } from "@/testUtils/prismaMock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_OTP_SEND_WINDOW_MS,
  EMAIL_VERIFICATION_CODE_EXPIRY_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  MAX_EMAIL_OTP_SENDS_PER_WINDOW,
} from "../constants";
import type { EmailOtpPurposeValue, IssueEmailOtpResult } from "../types";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { issueEmailOtp } from "./issueEmailOtp";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const EMAIL = "client@example.com";
const COOLDOWN_CUTOFF = new Date(NOW.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
const WINDOW_CUTOFF = new Date(NOW.getTime() - EMAIL_OTP_SEND_WINDOW_MS);

function cooldownElapsedOrPurposeSwitched(purpose: EmailOtpPurposeValue) {
  return [{ sentAt: { lte: COOLDOWN_CUTOFF } }, { purpose: { not: purpose } }];
}

function issuedCode(result: IssueEmailOtpResult): string {
  if (!result.issued) {
    throw new Error("expected a code to be issued");
  }
  return result.code;
}

describe("issueEmailOtp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates the row on a first send with a fresh window and a normalised email", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.emailOtpChallenge.createMany.mockResolvedValueOnce({ count: 1 });

    const result = await issueEmailOtp({ email: "  Client@Example.COM ", purpose: "CLIENT_SIGN_IN" });

    const code = issuedCode(result);
    expect(code).toMatch(/^\d{6}$/);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(2);
    for (const [args] of prismaMock.emailOtpChallenge.updateMany.mock.calls) {
      expect(args.where?.email).toBe(EMAIL);
    }
    expect(prismaMock.emailOtpChallenge.createMany).toHaveBeenCalledWith({
      data: [
        {
          email: EMAIL,
          purpose: "CLIENT_SIGN_IN",
          // The emailed plaintext is the code whose hash was stored.
          codeHash: hashEmailVerificationCode(code),
          expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
          attempts: 0,
          sentAt: NOW,
          consumedAt: null,
          windowStartedAt: NOW,
          windowSendCount: 1,
        },
      ],
      skipDuplicates: true,
    });
  });

  it("issues nothing while the cooldown holds for the same purpose", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.emailOtpChallenge.createMany.mockResolvedValueOnce({ count: 0 });

    const result = await issueEmailOtp({ email: EMAIL, purpose: "CLIENT_SIGN_IN" });

    expect(result).toEqual({ issued: false });
    const [[inWindow], [rollover]] = prismaMock.emailOtpChallenge.updateMany.mock.calls;
    expect(inWindow.where).toEqual({
      email: EMAIL,
      windowStartedAt: { gt: WINDOW_CUTOFF },
      windowSendCount: { lt: MAX_EMAIL_OTP_SENDS_PER_WINDOW },
      OR: cooldownElapsedOrPurposeSwitched("CLIENT_SIGN_IN"),
    });
    expect(rollover.where).toEqual({
      email: EMAIL,
      windowStartedAt: { lte: WINDOW_CUTOFF },
      OR: cooldownElapsedOrPurposeSwitched("CLIENT_SIGN_IN"),
    });
  });

  it("bypasses the cooldown on a purpose switch and re-issues within the window", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await issueEmailOtp({ email: EMAIL, purpose: "BOOKING_SUBMISSION" });

    const code = issuedCode(result);
    expect(prismaMock.emailOtpChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.emailOtpChallenge.createMany).not.toHaveBeenCalled();
    const [[args]] = prismaMock.emailOtpChallenge.updateMany.mock.calls;
    expect(args.where?.OR).toContainEqual({ purpose: { not: "BOOKING_SUBMISSION" } });
    expect(args.data).toEqual({
      purpose: "BOOKING_SUBMISSION",
      codeHash: hashEmailVerificationCode(code),
      expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
      attempts: 0,
      sentAt: NOW,
      consumedAt: null,
      windowSendCount: { increment: 1 },
    });
  });

  it("enforces the send cap outside the cooldown/purpose OR, so a switch can't skip it", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.emailOtpChallenge.createMany.mockResolvedValueOnce({ count: 0 });

    const result = await issueEmailOtp({ email: EMAIL, purpose: "BOOKING_SUBMISSION" });

    expect(result).toEqual({ issued: false });
    const [[inWindow]] = prismaMock.emailOtpChallenge.updateMany.mock.calls;
    expect(inWindow.where).toMatchObject({
      windowStartedAt: { gt: WINDOW_CUTOFF },
      windowSendCount: { lt: MAX_EMAIL_OTP_SENDS_PER_WINDOW },
    });
    expect(inWindow.where?.OR).toEqual(cooldownElapsedOrPurposeSwitched("BOOKING_SUBMISSION"));
  });

  it("starts a new window once the old one has rolled over", async () => {
    prismaMock.emailOtpChallenge.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await issueEmailOtp({ email: EMAIL, purpose: "CLIENT_SIGN_IN" });

    const code = issuedCode(result);
    expect(prismaMock.emailOtpChallenge.createMany).not.toHaveBeenCalled();
    const [, [rollover]] = prismaMock.emailOtpChallenge.updateMany.mock.calls;
    expect(rollover.where).toEqual({
      email: EMAIL,
      windowStartedAt: { lte: WINDOW_CUTOFF },
      OR: cooldownElapsedOrPurposeSwitched("CLIENT_SIGN_IN"),
    });
    expect(rollover.data).toEqual({
      purpose: "CLIENT_SIGN_IN",
      codeHash: hashEmailVerificationCode(code),
      expiresAt: new Date(NOW.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS),
      attempts: 0,
      sentAt: NOW,
      consumedAt: null,
      windowStartedAt: NOW,
      windowSendCount: 1,
    });
  });

  it("issues nothing when a concurrent first send created the row first", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.emailOtpChallenge.createMany.mockResolvedValueOnce({ count: 0 });

    const result = await issueEmailOtp({ email: EMAIL, purpose: "CLIENT_SIGN_IN" });

    expect(result).toEqual({ issued: false });
    expect(prismaMock.emailOtpChallenge.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });

  it("propagates a DB failure to the caller without creating a row", async () => {
    prismaMock.emailOtpChallenge.updateMany.mockRejectedValueOnce(new Error("connection lost"));

    await expect(issueEmailOtp({ email: EMAIL, purpose: "CLIENT_SIGN_IN" })).rejects.toThrow(
      "connection lost"
    );
    expect(prismaMock.emailOtpChallenge.createMany).not.toHaveBeenCalled();
  });
});
