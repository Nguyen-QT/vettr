import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import type { ClientLoginResult, LoginInput } from "../types";
import { createSession } from "./createSession";
import { recordAuditEvent } from "./recordAuditEvent";
import { recordFailedLoginAttempt } from "./recordFailedLoginAttempt";
import { resetFailedLoginAttempts } from "./resetFailedLoginAttempts";
import { verifyPassword } from "./verifyPassword";

// Mirrors loginArtist.ts, scoped to role CLIENT and a clientProfileId
// instead of an artistId (CLAUDE.md 5.2).
export async function loginClient(input: LoginInput): Promise<ClientLoginResult> {
  const account = await prisma.account.findUnique({
    where: { email: input.email },
  });

  if (!account || account.role !== "CLIENT" || !account.clientProfileId) {
    // No password was checked, so there's no attempt to record here --
    // this also keeps an artist-login probe against a CLIENT email from
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

  // Reached only after the password is proven, so this reveals nothing to
  // a prober (27.3 design). The counter reset above intentionally still
  // applies -- the password was correct.
  if (account.emailVerifiedAt === null) {
    return { success: true, pendingVerification: true, clientProfileId: account.clientProfileId };
  }

  const session = await createSession(account.id, account.role);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    clientProfileId: account.clientProfileId,
  };
}
