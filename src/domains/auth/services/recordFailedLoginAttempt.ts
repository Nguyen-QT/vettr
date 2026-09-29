import { prisma } from "@/lib/prisma";

import { LOGIN_LOCKOUT_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";

// Bounded so a hot account under concurrent failed logins can't spin
// forever -- a few retries is enough to win the race against a handful
// of parallel requests; beyond that, one attempt going uncounted is an
// acceptable miss (see the fail-open note below).
const MAX_CAS_RETRIES = 3;

// Reads the current row and writes back with an atomic compare-and-swap
// (updateMany scoped to the exact row values just read) rather than a
// blind update, to close the TOCTOU race where two concurrent failed
// logins for the same account both read count N and both write N+1,
// silently losing an attempt (architecture.md Sec8.A). Uses Node's clock
// (not the DB's) so this stays consistent with the lockout check that
// 27.1.2.3 performs before ever calling this function.
//
// Callers only call this after their own lock check passed, so the only
// "previously locked" state this ever sees is a lockout that has since
// naturally expired -- that restarts the counter at 1 rather than
// continuing to increment the stale pre-lockout count.
export async function recordFailedLoginAttempt(accountId: string): Promise<void> {
  try {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { failedLoginAttempts: true, lockedUntil: true },
      });

      if (!account) {
        return;
      }

      const now = Date.now();
      const isCurrentlyLocked = account.lockedUntil !== null && account.lockedUntil.getTime() > now;
      if (isCurrentlyLocked) {
        // A parallel request locked the account between this caller's own
        // lock check and this call -- that lock already covers this
        // attempt, so don't extend it further.
        return;
      }

      const lockoutExpired = account.lockedUntil !== null && account.lockedUntil.getTime() <= now;
      const failedLoginAttempts = lockoutExpired ? 1 : account.failedLoginAttempts + 1;
      const lockedUntil =
        failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
          ? new Date(now + LOGIN_LOCKOUT_DURATION_MS)
          : null;

      const { count } = await prisma.account.updateMany({
        where: {
          id: accountId,
          failedLoginAttempts: account.failedLoginAttempts,
          lockedUntil: account.lockedUntil,
        },
        data: { failedLoginAttempts, lockedUntil },
      });

      if (count === 1) {
        return;
      }
      // count === 0: the row changed between the read and the write --
      // loop back and retry against the fresh state.
    }

    console.error(
      `Failed to record failed login attempt for account ${accountId}: exhausted CAS retries.`
    );
  } catch (error) {
    // Never rethrow -- a bookkeeping failure here must not turn a
    // wrong-password login into an uncaught 500 (architecture.md Sec8.C).
    // accountId only, never the email (PII).
    console.error(`Unexpected failure recording failed login attempt for account ${accountId}:`, error);
  }
}
