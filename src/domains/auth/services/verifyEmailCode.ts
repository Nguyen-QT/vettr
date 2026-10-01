import { timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";

import {
  INVALID_VERIFICATION_CODE_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { ClientAuthResult, VerifyEmailCodeInput } from "../types";
import { createSession } from "./createSession";
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

const INVALID_RESULT: ClientAuthResult = {
  success: false,
  error: INVALID_VERIFICATION_CODE_ERROR_MESSAGE,
};

// Domain Service (CLAUDE.md 27.3.2.5): the only path that issues a
// session for a fresh signup. Every rejection returns the same generic
// error (unknown email, wrong/expired/locked-out code, already verified)
// so it can't enumerate accounts or their state.
//
// Concurrency (architecture.md Sec8.A): an attempt is *reserved* with an
// atomic updateMany (guarded on the exact stored hash, unverified, under
// the cap, unexpired) before the comparison, so parallel guesses can
// never exceed MAX_EMAIL_VERIFICATION_ATTEMPTS, and the consume step is
// guarded the same way so a double-submit yields exactly one session.
export async function verifyEmailCode(input: VerifyEmailCodeInput): Promise<ClientAuthResult> {
  try {
    const account = await prisma.account.findUnique({
      where: { email: input.email },
    });

    const storedHash = account?.emailVerificationCodeHash ?? null;
    const expiresAt = account?.emailVerificationCodeExpiresAt ?? null;
    const now = new Date();

    if (
      !account ||
      account.role !== "CLIENT" ||
      !account.clientProfileId ||
      account.emailVerifiedAt !== null ||
      storedHash === null ||
      expiresAt === null ||
      expiresAt.getTime() <= now.getTime() ||
      account.emailVerificationAttempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS
    ) {
      return INVALID_RESULT;
    }

    const { count: reserved } = await prisma.account.updateMany({
      where: {
        id: account.id,
        emailVerificationCodeHash: storedHash,
        emailVerifiedAt: null,
        emailVerificationCodeExpiresAt: { gt: now },
        emailVerificationAttempts: { lt: MAX_EMAIL_VERIFICATION_ATTEMPTS },
      },
      data: { emailVerificationAttempts: { increment: 1 } },
    });
    if (reserved === 0) {
      return INVALID_RESULT;
    }

    if (!hashesMatch(hashEmailVerificationCode(input.code), storedHash)) {
      // Whichever concurrent guess pushed the counter to the cap, the
      // code is dead -- guarded on the cap so an under-cap miss is a no-op.
      await prisma.account.updateMany({
        where: {
          id: account.id,
          emailVerificationCodeHash: storedHash,
          emailVerificationAttempts: { gte: MAX_EMAIL_VERIFICATION_ATTEMPTS },
        },
        data: { emailVerificationCodeHash: null, emailVerificationCodeExpiresAt: null },
      });
      return INVALID_RESULT;
    }

    const { count: consumed } = await prisma.account.updateMany({
      where: {
        id: account.id,
        emailVerificationCodeHash: storedHash,
        emailVerifiedAt: null,
      },
      data: {
        emailVerifiedAt: now,
        emailVerificationCodeHash: null,
        emailVerificationCodeExpiresAt: null,
        emailVerificationAttempts: 0,
      },
    });
    if (consumed === 0) {
      // A concurrent request with the same correct code already won.
      return INVALID_RESULT;
    }

    const session = await createSession(account.id, account.role);

    return {
      success: true,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      clientProfileId: account.clientProfileId,
    };
  } catch {
    // Fixed allowlist only -- never the email, the code, or the raw
    // driver error (architecture.md Sec8.B).
    console.error({ operation: "verifyEmailCode", reason: "unexpected_failure" });
    return { success: false, error: VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE };
  }
}
