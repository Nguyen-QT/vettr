import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { prisma } from "@/lib/prisma";
import { createIntegrationTracker } from "@/testUtils/integrationDb";

import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_OTP_SENDS_PER_WINDOW,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
} from "../constants";
import type { RequestBookingSubmissionCodeResult, RequestClientSignInCodeResult } from "../types";
import { checkEmailOtpCode } from "./checkEmailOtpCode";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";
import { issueEmailOtp } from "./issueEmailOtp";
import { requestBookingSubmissionCode } from "./requestBookingSubmissionCode";
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
// The full pool width, split evenly between the two purposes.
const PARALLEL_MIXED_REQUESTS = 10;
const COOLDOWN_ELAPSED_MS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS + 1_000;
const ONE_HOUR_MS = 60 * 60 * 1000;
// Each case runs two sign-in bursts, and each burst waits out the 1.5 s
// response floor, which leaves vitest's 5 s default little headroom.
const TWO_SIGN_IN_BURSTS_TIMEOUT_MS = 15_000;

async function createEligibleClient(): Promise<{ accountId: string; email: string }> {
  const client = await tracker.createClientProfile();
  const account = await prisma.account.create({
    data: { email: client.email, role: "CLIENT", clientProfileId: client.id },
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

// A real CLIENT_SIGN_IN row with `windowSendCount` sends used, an hour into
// its window (so the rollover branch can't match) and out of cooldown.
async function seedSendWindow(email: string, windowSendCount: number): Promise<void> {
  await issueCode(email);
  await prisma.emailOtpChallenge.update({
    where: { email },
    data: {
      windowSendCount,
      windowStartedAt: new Date(Date.now() - ONE_HOUR_MS),
      sentAt: new Date(Date.now() - COOLDOWN_ELAPSED_MS),
    },
  });
}

async function ageCooldown(email: string): Promise<void> {
  await prisma.emailOtpChallenge.update({
    where: { email },
    data: { sentAt: new Date(Date.now() - COOLDOWN_ELAPSED_MS) },
  });
}

// Alternates purposes so the cooldown can't block: a purpose switch skips
// it, and only the send cap stops the next issue.
function requestEitherPurpose(
  email: string,
  index: number
): Promise<RequestClientSignInCodeResult | RequestBookingSubmissionCodeResult> {
  return index % 2 === 0 ? requestClientSignInCode({ email }) : requestBookingSubmissionCode({ email });
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

function inParallel<T>(count: number, run: (index: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, index) => run(index)));
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

  // 28.11.2.3: the cap is checked in issueEmailOtp's atomic updateMany. Each
  // case starts one send below it, so a cap that didn't hold under the race
  // would visibly overshoot to 11.
  describe("the send cap holds under parallel bursts", () => {
    it(
      "a same-purpose burst sends once to reach the cap, and the cap, not the cooldown, blocks the next burst",
      async () => {
        const { email } = await createEligibleClient();
        await seedSendWindow(email, MAX_EMAIL_OTP_SENDS_PER_WINDOW - 1);

        const results = await inParallel(PARALLEL_REQUESTS, () => requestClientSignInCode({ email }));

        expect(results).toEqual(Array(PARALLEL_REQUESTS).fill({ success: true }));
        expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
        const [, sentCode] = sendVerificationEmailMock.mock.calls[0];
        const capped = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
        expect(capped.windowSendCount).toBe(MAX_EMAIL_OTP_SENDS_PER_WINDOW);
        expect(capped.codeHash).toBe(hashEmailVerificationCode(sentCode));

        // Out of cooldown, so only the cap can block these.
        await ageCooldown(email);
        const blocked = await inParallel(PARALLEL_REQUESTS, () => requestClientSignInCode({ email }));

        expect(blocked).toEqual(Array(PARALLEL_REQUESTS).fill({ success: true }));
        expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
        const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
        expect(challenge.windowSendCount).toBe(MAX_EMAIL_OTP_SENDS_PER_WINDOW);
        expect(challenge.codeHash).toBe(capped.codeHash);
      },
      TWO_SIGN_IN_BURSTS_TIMEOUT_MS
    );

    it(
      "an alternating sign-in/booking burst sends once to reach the cap, and an aged follow-up burst sends nothing",
      async () => {
        const { email } = await createEligibleClient();
        await seedSendWindow(email, MAX_EMAIL_OTP_SENDS_PER_WINDOW - 1);

        // After the first issue, every opposite-purpose call passes the
        // cooldown. Only the cap stops the second send.
        const results = await inParallel(PARALLEL_MIXED_REQUESTS, (index) =>
          requestEitherPurpose(email, index)
        );

        expect(results).toEqual(Array(PARALLEL_MIXED_REQUESTS).fill({ success: true }));
        expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
        const [, sentCode] = sendVerificationEmailMock.mock.calls[0];
        const capped = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
        expect(capped.windowSendCount).toBe(MAX_EMAIL_OTP_SENDS_PER_WINDOW);
        expect(capped.codeHash).toBe(hashEmailVerificationCode(sentCode));

        await ageCooldown(email);
        const blocked = await inParallel(PARALLEL_MIXED_REQUESTS, (index) =>
          requestEitherPurpose(email, index)
        );

        expect(blocked).toEqual(Array(PARALLEL_MIXED_REQUESTS).fill({ success: true }));
        expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
        const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({ where: { email } });
        expect(challenge.windowSendCount).toBe(MAX_EMAIL_OTP_SENDS_PER_WINDOW);
        expect(challenge.codeHash).toBe(capped.codeHash);
      },
      TWO_SIGN_IN_BURSTS_TIMEOUT_MS
    );
  });
});
