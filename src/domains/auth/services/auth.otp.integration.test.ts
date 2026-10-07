import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { prisma } from "@/lib/prisma";
import { createIntegrationTracker } from "@/testUtils/integrationDb";

import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
} from "../constants";
import { checkEmailOtpCode } from "./checkEmailOtpCode";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { issueEmailOtp } from "./issueEmailOtp";
import { requestClientSignInCode } from "./requestClientSignInCode";
import { sendVerificationEmail } from "./sendVerificationEmail";
import { signInClientWithEmailOtp } from "./signInClientWithEmailOtp";

// External side effect only -- never hit Resend from the integration tier.
vi.mock("./sendVerificationEmail", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Real-database email-OTP tests (54.3.2.9): the mocked unit tier only pins
// each guard's WHERE shape; these prove Postgres actually serialises the
// races the OTP services rely on (row lock + re-checked WHERE, ON CONFLICT
// DO NOTHING). Parallel width stays within the default pg pool size (10)
// so the calls genuinely race instead of queueing for a connection.
const tracker = createIntegrationTracker();
const sendVerificationEmailMock = vi.mocked(sendVerificationEmail);

const INVALID = { success: false, error: INVALID_EMAIL_OTP_ERROR_MESSAGE };
const PARALLEL_REQUESTS = 5;
// Twice the cap, so a broken reservation would visibly overshoot it.
const PARALLEL_GUESSES = MAX_EMAIL_VERIFICATION_ATTEMPTS * 2;

async function createEligibleClient(): Promise<{ accountId: string; email: string }> {
  const client = await tracker.createClientProfile();
  const account = await prisma.account.create({
    data: { email: client.email, passwordHash: "x", role: "CLIENT", clientProfileId: client.id },
  });
  tracker.trackEmail(client.email);
  return { accountId: account.id, email: client.email };
}

// Seeds a code through the real write path, skipping
// requestClientSignInCode's response floor.
async function issueCode(email: string): Promise<string> {
  const otp = await issueEmailOtp({ email, purpose: "CLIENT_SIGN_IN" });
  if (!otp.issued) {
    throw new Error("expected a fresh code to be issued");
  }
  return otp.code;
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

function inParallel<T>(count: number, run: () => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, run));
}

describe("email OTP integration", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(async () => {
    await tracker.wipe();
    sendVerificationEmailMock.mockClear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  describe("requestClientSignInCode: parallel requests send exactly once", () => {
    it("parallel first requests create one challenge and send its code once", async () => {
      const { email } = await createEligibleClient();

      const results = await inParallel(PARALLEL_REQUESTS, () => requestClientSignInCode({ email }));

      expect(results).toEqual(Array(PARALLEL_REQUESTS).fill({ success: true }));
      expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
      const [sentTo, sentCode] = sendVerificationEmailMock.mock.calls[0];
      expect(sentTo).toBe(email);
      // No losing call overwrote the code that was emailed.
      const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
      expect(challenge.windowSendCount).toBe(1);
      expect(challenge.codeHash).toBe(hashEmailVerificationCode(sentCode));
    });

    it("parallel re-sends after the cooldown reissue and send exactly once", async () => {
      const { email } = await createEligibleClient();
      await issueCode(email);
      await prisma.emailOtpChallenge.update({
        where: { email },
        data: { sentAt: new Date(Date.now() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - 1_000) },
      });

      const results = await inParallel(PARALLEL_REQUESTS, () => requestClientSignInCode({ email }));

      expect(results).toEqual(Array(PARALLEL_REQUESTS).fill({ success: true }));
      expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
      const [, sentCode] = sendVerificationEmailMock.mock.calls[0];
      const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
      expect(challenge.windowSendCount).toBe(2);
      expect(challenge.codeHash).toBe(hashEmailVerificationCode(sentCode));
    });
  });

  describe("parallel guesses never exceed the attempt cap", () => {
    it("parallel wrong guesses stop at the cap and kill the code", async () => {
      const { accountId, email } = await createEligibleClient();
      const code = await issueCode(email);

      const results = await inParallel(PARALLEL_GUESSES, () =>
        signInClientWithEmailOtp({ email, code: wrongCodeFor(code) })
      );

      expect(results).toEqual(Array(PARALLEL_GUESSES).fill(INVALID));
      const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
      expect(challenge.attempts).toBe(MAX_EMAIL_VERIFICATION_ATTEMPTS);
      expect(challenge.codeHash).toBeNull();

      // The real code is dead once the cap is hit.
      expect(await signInClientWithEmailOtp({ email, code })).toEqual(INVALID);
      expect(await prisma.session.count({ where: { accountId } })).toBe(0);
    });

    it("parallel correct guesses also reserve attempts, so only the cap's worth match", async () => {
      const { email } = await createEligibleClient();
      const code = await issueCode(email);

      const results = await inParallel(PARALLEL_GUESSES, () =>
        checkEmailOtpCode({ email, purpose: "CLIENT_SIGN_IN", code })
      );

      expect(results.filter((r) => r.valid)).toHaveLength(MAX_EMAIL_VERIFICATION_ATTEMPTS);
      const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
      expect(challenge.attempts).toBe(MAX_EMAIL_VERIFICATION_ATTEMPTS);
      // Checking never consumes -- that's the caller's transaction.
      expect(challenge.codeHash).toBe(hashEmailVerificationCode(code));
    });
  });

  describe("parallel correct verifications yield one session", () => {
    it("exactly one verify wins; the losers get the generic invalid result", async () => {
      const { accountId, email } = await createEligibleClient();
      const code = await issueCode(email);

      // Within the cap, so every call can reserve an attempt and the race
      // is decided at the consume guard.
      const results = await inParallel(MAX_EMAIL_VERIFICATION_ATTEMPTS, () =>
        signInClientWithEmailOtp({ email, code })
      );

      expect(results.filter((r) => !r.success)).toEqual(
        Array(MAX_EMAIL_VERIFICATION_ATTEMPTS - 1).fill(INVALID)
      );
      // Handled losers: no unexpected-failure path, no failed audit write.
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      const sessions = await prisma.session.findMany({ where: { accountId } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].activeRole).toBe("CLIENT");
      expect(results.filter((r) => r.success)).toEqual([
        expect.objectContaining({ success: true, sessionId: sessions[0].id }),
      ]);

      const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
      expect(challenge.codeHash).toBeNull();
      expect(challenge.consumedAt).not.toBeNull();
      expect(
        await prisma.auditEvent.count({
          where: { accountId, eventType: "EMAIL_OTP_SIGN_IN", outcome: "SUCCESS" },
        })
      ).toBe(1);
    });
  });
});
