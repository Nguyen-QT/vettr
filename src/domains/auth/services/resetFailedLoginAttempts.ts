import { prisma } from "@/lib/prisma";

// Mirrors recordFailedLoginAttempt's never-throw discipline (architecture.md
// Sec8.C) -- a bookkeeping failure here must not turn a successful login
// into an uncaught 500. Unlike recordFailedLoginAttempt, this is a single
// unconditional write with no CAS/retry loop: resetting to a fixed value on
// success is idempotent regardless of the row's current state, so there's
// no lost-update race to guard against.
export async function resetFailedLoginAttempts(accountId: string): Promise<void> {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  } catch (error) {
    // Covers both P2025 (account deleted mid-request -- nothing to reset)
    // and any other unexpected DB failure. accountId only, never PII.
    console.error(`Unexpected failure resetting failed login attempts for account ${accountId}:`, error);
  }
}
