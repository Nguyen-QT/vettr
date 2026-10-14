import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import type { LoginInput, LoginResult } from "../types";
import { createSession } from "./createSession";
import { recordAuditEvent } from "./recordAuditEvent";
import { reserveLoginAttempt } from "./reserveLoginAttempt";
import { resetFailedLoginAttempts } from "./resetFailedLoginAttempts";
import { verifyPassword } from "./verifyPassword";

// Artist accounts are manually provisioned (CLAUDE.md 5.1) -- this only
// authenticates against an existing Account row, never creates one.
// Scoped to role ARTIST so a CLIENT account's credentials (even if the
// email happened to collide, which it can't -- email is globally
// unique) could never log in to the artist dashboard.
export async function loginArtist(input: LoginInput): Promise<LoginResult> {
  const account = await prisma.account.findUnique({
    where: { email: input.email },
  });

  if (!account || account.role !== "ARTIST" || !account.artistId) {
    // No password was checked, so there's no attempt to record here --
    // this also keeps a client-login probe against an ARTIST email from
    // ever incrementing that account's lockout counter.
    // attemptedEmail only (no accountId) -- there's no verified identity
    // to attach to; the caller still gets the same generic error.
    await recordAuditEvent({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: account ? "ROLE_MISMATCH" : "ACCOUNT_NOT_FOUND",
      attemptedEmail: input.email,
    });
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  // The attempt is reserved before the password is checked (28.11.2.1), so
  // a parallel burst can't get more than MAX_FAILED_LOGIN_ATTEMPTS
  // passwords checked per lock cycle. This is the only lock check: the row
  // read above may already be stale. A failed reservation means locked,
  // and gets the same generic error, never a distinct message -- lockout
  // state must not become a new enumeration vector on top of the existing
  // generic-error protection (27.1 design note). verifyPassword is skipped
  // entirely while locked.
  const reserved = await reserveLoginAttempt(account.id);
  if (!reserved) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const passwordMatches = await verifyPassword(input.password, account.passwordHash);
  if (!passwordMatches) {
    // No further write: the reservation already counted this attempt, and
    // the one that reached MAX_FAILED_LOGIN_ATTEMPTS already armed the lock.
    await recordAuditEvent({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "INVALID_PASSWORD",
      accountId: account.id,
    });
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  // Unconditional: every login reserved an attempt, including this one.
  await resetFailedLoginAttempts(account.id);

  const session = await createSession(account.id, account.role);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    artistId: account.artistId,
  };
}
