import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { ClientAuthResult, SignInClientWithEmailOtpInput } from "../types";
import { checkEmailOtpCode } from "./checkEmailOtpCode";
import { createSession } from "./createSession";
import { recordAuditEvent } from "./recordAuditEvent";

const INVALID_RESULT: ClientAuthResult = {
  success: false,
  error: INVALID_EMAIL_OTP_ERROR_MESSAGE,
};

// Domain Service (54.3.2.7): redeems a CLIENT_SIGN_IN code for a CLIENT
// session -- the verify half of 54.3.2.6's passwordless portal sign-in.
// Every rejection is the same generic error, so it can't enumerate
// accounts or code state. Only a CLIENT account with a linked
// ClientProfile gets a session; an ARTIST-home account (incl. dual-role)
// never does -- email access must not bypass the artist password.
//
// The code is checked outside the transaction so its reserved attempt
// survives a rollback (the 5-guess cap holds across retries). The consume
// and the session then commit together: a failed session insert leaves
// the code redeemable, and the consume's guard (challengeId + codeHash)
// makes a concurrent double-verify yield exactly one session.
//
// emailVerifiedAt is deliberately untouched: until 54.8 nulls client
// passwords, setting it would let a squatter's password log into an
// unverified account (27.3.2.8).
export async function signInClientWithEmailOtp(
  input: SignInClientWithEmailOtpInput
): Promise<ClientAuthResult> {
  const email = normalizeEmail(input.email);

  try {
    const check = await checkEmailOtpCode({ email, purpose: "CLIENT_SIGN_IN", code: input.code });
    if (!check.valid) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_SIGN_IN",
        outcome: "REJECTED",
        reasonCode: "INVALID_EMAIL_OTP",
        attemptedEmail: email,
      });
      return INVALID_RESULT;
    }

    const account = await prisma.account.findUnique({
      where: { email },
      select: { id: true, role: true, clientProfileId: true },
    });

    if (!account) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_SIGN_IN",
        outcome: "REJECTED",
        reasonCode: "ACCOUNT_NOT_FOUND",
        attemptedEmail: email,
      });
      return INVALID_RESULT;
    }

    // The code is left unconsumed -- nothing was redeemed. accountId (not
    // attemptedEmail) from here on: a valid code has proven the inbox.
    const { clientProfileId } = account;
    if (account.role !== "CLIENT" || clientProfileId === null) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_SIGN_IN",
        outcome: "REJECTED",
        reasonCode: account.role !== "CLIENT" ? "ROLE_MISMATCH" : "NOT_LINKED_TO_CLIENT",
        accountId: account.id,
      });
      return INVALID_RESULT;
    }

    const session = await prisma.$transaction(async (tx) => {
      const { count: consumed } = await tx.emailOtpChallenge.updateMany({
        where: { id: check.challengeId, codeHash: check.codeHash },
        data: { codeHash: null, consumedAt: new Date() },
      });
      if (consumed === 0) {
        // A concurrent verify with the same code, or a reissue, got there
        // first.
        return null;
      }
      return createSession(account.id, "CLIENT", tx);
    });

    // After the transaction resolves, so a rollback never records a
    // sign-in that didn't happen (mirrors linkOrCreateClientProfileForAccount).
    if (!session) {
      await recordAuditEvent({
        eventType: "EMAIL_OTP_SIGN_IN",
        outcome: "REJECTED",
        reasonCode: "INVALID_EMAIL_OTP",
        accountId: account.id,
      });
      return INVALID_RESULT;
    }

    await recordAuditEvent({
      eventType: "EMAIL_OTP_SIGN_IN",
      outcome: "SUCCESS",
      reasonCode: "SIGNED_IN_WITH_EMAIL_OTP",
      accountId: account.id,
    });

    return {
      success: true,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      clientProfileId,
    };
  } catch {
    // Fixed allowlist only -- never the email, the code, or the raw
    // driver error (architecture.md Sec8.B).
    console.error({ operation: "signInClientWithEmailOtp", reason: "unexpected_failure" });
    return { success: false, error: SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE };
  }
}
