import { prisma } from "@/lib/prisma";

import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { ResendVerificationCodeInput, ResendVerificationCodeResult } from "../types";
import { generateEmailVerificationCode } from "./generateEmailVerificationCode";
import { sendVerificationEmail } from "./sendVerificationEmail";

// Domain Service (CLAUDE.md 27.3.2.6): regenerates and re-emails a
// verification code. Returns `{ success: true }` whether or not an
// account matched or the cooldown blocked the send. No timing padding:
// signupClient's distinct errors already reveal whether an email has an
// account, so padding here would only cost serverless time under a flood.
//
// Concurrency (architecture.md Sec8.A): the cooldown lives in the atomic
// updateMany's WHERE, so parallel double-clicks yield exactly one
// regenerate+send. The new code is persisted before the send
// (architecture.md Sec6).
//
// A failed send deliberately keeps the cooldown: when Resend is degraded
// (429/quota/misconfig) every send fails, and releasing the cooldown
// would turn each click into another provider call (Sec6 retry cascade).
// sendVerificationEmail never throws and logs its own non-PII reason.
export async function resendVerificationCode(
  input: ResendVerificationCodeInput
): Promise<ResendVerificationCodeResult> {
  try {
    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
    const { code, codeHash, expiresAt } = generateEmailVerificationCode(now);

    const { count } = await prisma.account.updateMany({
      where: {
        email: input.email,
        role: "CLIENT",
        clientProfileId: { not: null },
        emailVerifiedAt: null,
        OR: [
          { emailVerificationCodeSentAt: null },
          { emailVerificationCodeSentAt: { lte: cooldownCutoff } },
        ],
      },
      data: {
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpiresAt: expiresAt,
        emailVerificationCodeSentAt: now,
        emailVerificationAttempts: 0,
      },
    });

    if (count > 0) {
      await sendVerificationEmail(input.email, code);
    }

    return { success: true };
  } catch {
    // Fixed allowlist only -- never the email, the code, or the raw
    // driver error (architecture.md Sec8.B).
    console.error({ operation: "resendVerificationCode", reason: "unexpected_failure" });
    return { success: false, error: RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE };
  }
}
