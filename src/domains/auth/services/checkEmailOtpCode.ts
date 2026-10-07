import { timingSafeEqual } from "node:crypto";

import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import { MAX_EMAIL_VERIFICATION_ATTEMPTS } from "../constants";
import type { CheckEmailOtpCodeInput, CheckEmailOtpCodeResult } from "../types";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";

function hashesMatch(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch; both sides are normally
  // 64-char sha256 hex, so this only guards a corrupted stored value.
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

const INVALID_RESULT: CheckEmailOtpCodeResult = { valid: false };

// Domain Service (54.3.2.5): checks a guess against the EmailOtpChallenge
// code for one normalised email + purpose. It never consumes -- the
// caller does that inside its own transaction (54.3.2.7, 54.5.2.2), so a
// rolled-back provisioning step leaves the code redeemable. Deliberately
// catches nothing: callers own the generic error and the non-PII log for
// a DB failure (mirrors issueEmailOtp).
//
// A code issued for the other purpose is rejected outright: the reissue
// that switched purpose is what the inbox owner is now holding.
//
// Concurrency (architecture.md Sec8.A): an attempt is *reserved* with an
// atomic updateMany (guarded on the exact stored hash, purpose, expiry
// and the cap) before the comparison, so parallel guesses can never
// exceed MAX_EMAIL_VERIFICATION_ATTEMPTS -- including the matching one,
// which is what caps probing across rolled-back verifications.
export async function checkEmailOtpCode(
  input: CheckEmailOtpCodeInput
): Promise<CheckEmailOtpCodeResult> {
  const email = normalizeEmail(input.email);
  const challenge = await prisma.emailOtpChallenge.findUnique({ where: { email } });

  const storedHash = challenge?.codeHash ?? null;
  const now = new Date();

  if (
    !challenge ||
    storedHash === null ||
    challenge.purpose !== input.purpose ||
    challenge.expiresAt.getTime() <= now.getTime() ||
    challenge.attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS
  ) {
    return INVALID_RESULT;
  }

  const { count: reserved } = await prisma.emailOtpChallenge.updateMany({
    where: {
      id: challenge.id,
      codeHash: storedHash,
      purpose: input.purpose,
      expiresAt: { gt: now },
      attempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (reserved === 0) {
    return INVALID_RESULT;
  }

  if (!hashesMatch(hashEmailVerificationCode(input.code), storedHash)) {
    // Whichever concurrent guess pushed the counter to the cap, the
    // code is dead -- guarded on the cap so an under-cap miss is a no-op.
    await prisma.emailOtpChallenge.updateMany({
      where: {
        id: challenge.id,
        codeHash: storedHash,
        attempts: { gte: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { codeHash: null },
    });
    return INVALID_RESULT;
  }

  return { valid: true, challengeId: challenge.id, codeHash: storedHash };
}
