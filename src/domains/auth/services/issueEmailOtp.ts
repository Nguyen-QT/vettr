import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  EMAIL_OTP_SEND_WINDOW_MS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  MAX_EMAIL_OTP_SENDS_PER_WINDOW,
} from "../constants";
import type { IssueEmailOtpInput, IssueEmailOtpResult } from "../types";
import { generateEmailVerificationCode } from "./generateEmailVerificationCode";

// Domain Service (54.3.2.4): the single write choke point that issues an
// EmailOtpChallenge code for one normalised email + purpose. Only the
// hash is stored; the plaintext is returned so the caller can email it.
// Deliberately sends nothing and catches nothing -- callers own the send
// (with their own timeout), eligibility, and the generic error + non-PII
// log for a DB failure (mirrors createSession).
//
// Guards: a 60s cooldown on sentAt, skipped when the purpose changes (the
// old code can't be redeemed for the new purpose anyway), and a send cap
// per window that a purpose switch can never skip -- that's what bounds
// alternating sign-in/booking requests.
//
// Concurrency (architecture.md Sec8.A): every guard lives in an atomic
// updateMany's WHERE, so parallel re-sends serialise on the row lock and
// the loser fails the re-checked cooldown. Updates run before the create
// so no interleaving ends with nobody sending: parallel first sends all
// miss the updates and exactly one skip-duplicates insert wins, and a row
// pruned between steps is simply re-created.
export async function issueEmailOtp(input: IssueEmailOtpInput): Promise<IssueEmailOtpResult> {
  const email = normalizeEmail(input.email);
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
  const windowCutoff = new Date(now.getTime() - EMAIL_OTP_SEND_WINDOW_MS);
  const { code, codeHash, expiresAt } = generateEmailVerificationCode(now);

  const reissue = {
    purpose: input.purpose,
    codeHash,
    expiresAt,
    attempts: 0,
    sentAt: now,
    consumedAt: null,
  };
  const cooldownElapsedOrPurposeSwitched = [
    { sentAt: { lte: cooldownCutoff } },
    { purpose: { not: input.purpose } },
  ];

  const { count: issuedInWindow } = await prisma.emailOtpChallenge.updateMany({
    where: {
      email,
      windowStartedAt: { gt: windowCutoff },
      windowSendCount: { lt: MAX_EMAIL_OTP_SENDS_PER_WINDOW },
      OR: cooldownElapsedOrPurposeSwitched,
    },
    data: { ...reissue, windowSendCount: { increment: 1 } },
  });
  if (issuedInWindow > 0) {
    return { issued: true, code };
  }

  // sentAt can be recent even once the window has expired, so the
  // rollover keeps the cooldown guard.
  const { count: issuedOnRollover } = await prisma.emailOtpChallenge.updateMany({
    where: {
      email,
      windowStartedAt: { lte: windowCutoff },
      OR: cooldownElapsedOrPurposeSwitched,
    },
    data: { ...reissue, windowStartedAt: now, windowSendCount: 1 },
  });
  if (issuedOnRollover > 0) {
    return { issued: true, code };
  }

  const { count: created } = await prisma.emailOtpChallenge.createMany({
    data: [{ email, ...reissue, windowStartedAt: now, windowSendCount: 1 }],
    skipDuplicates: true,
  });
  if (created > 0) {
    return { issued: true, code };
  }

  // The row exists and is in cooldown or at the cap, or a concurrent
  // first send just created it and is sending its own code.
  return { issued: false };
}
