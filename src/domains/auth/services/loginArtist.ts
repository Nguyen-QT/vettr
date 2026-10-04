import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import type { LoginInput, LoginResult } from "../types";
import { createSession } from "./createSession";
import { recordAuditEvent } from "./recordAuditEvent";
import { recordFailedLoginAttempt } from "./recordFailedLoginAttempt";
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

  // Reuses the row already fetched above and Node's clock, consistent
  // with recordFailedLoginAttempt's own lock check (27.1.2.1). Never a
  // distinct error message -- lockout state must not become a new
  // enumeration vector on top of the existing generic-error protection
  // (27.1 design note). verifyPassword is skipped entirely while locked.
  const isLocked = account.lockedUntil !== null && account.lockedUntil.getTime() > Date.now();
  if (isLocked) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const passwordMatches = await verifyPassword(input.password, account.passwordHash);
  if (!passwordMatches) {
    await recordFailedLoginAttempt(account.id);
    await recordAuditEvent({
      eventType: "LOGIN_FAILED",
      outcome: "REJECTED",
      reasonCode: "INVALID_PASSWORD",
      accountId: account.id,
    });
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  if (account.failedLoginAttempts > 0 || account.lockedUntil !== null) {
    await resetFailedLoginAttempts(account.id);
  }

  const session = await createSession(account.id, account.role);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    artistId: account.artistId,
  };
}
