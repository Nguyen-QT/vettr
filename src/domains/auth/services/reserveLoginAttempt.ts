import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { LOGIN_LOCKOUT_DURATION_MS, MAX_FAILED_LOGIN_ATTEMPTS } from "../constants";

// Reserves one login attempt before the password is checked (28.11.2.1),
// the same reserve-before-compare order as the email-code attempt cap.
// Returns true if an attempt was reserved, false if the account is locked
// (or no longer exists). loginArtist treats false as the generic
// invalid-credentials error and never checks the password, so a parallel
// burst gets at most MAX_FAILED_LOGIN_ATTEMPTS passwords checked per lock
// cycle.
//
// One statement, so there is no read-then-write race (architecture.md
// Sec8.A): under READ COMMITTED, an UPDATE that waits on a concurrent one
// re-checks WHERE and recomputes SET against the newest row version. No
// increment is lost, and the MAX_FAILED_LOGIN_ATTEMPTS-th reservation arms
// the lock before the next one is evaluated. Keep it a single-table UPDATE:
// a CTE or FROM subquery isn't recomputed on that re-check, which brings
// the lost-increment race back.
//
// - A lock that has expired restarts the count at 1.
// - The casts are required. The pg adapter sends parameters untyped, and an
//   all-unknown CASE resolves to text, which can't be assigned to a
//   timestamp column (42804).
// - Times come from Node's clock, bound as UTC timestamps the way
//   pruneExpiredEmailOtpChallenges binds them. Never now() or timestamptz
//   here.
// - Raw SQL skips @updatedAt, so it is set explicitly.
export async function reserveLoginAttempt(accountId: string): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOGIN_LOCKOUT_DURATION_MS);

  try {
    const reserved = await prisma.$executeRaw`
      UPDATE "Account"
      SET "failedLoginAttempts" = CASE WHEN "lockedUntil" IS NULL THEN "failedLoginAttempts" + 1 ELSE 1 END,
          "lockedUntil" = CASE
            WHEN (CASE WHEN "lockedUntil" IS NULL THEN "failedLoginAttempts" + 1 ELSE 1 END) >= ${MAX_FAILED_LOGIN_ATTEMPTS}::int
            THEN ${lockUntil}::timestamp(3) ELSE NULL END,
          "updatedAt" = ${now}::timestamp(3)
      WHERE "id" = ${accountId}
        AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now}::timestamp(3))
    `;
    return reserved === 1;
  } catch (error) {
    // Fails closed: the generic error, never a throw. Only real ARTIST
    // emails reach this, so a 500 here would reveal which emails have an
    // artist account. Fixed allowlist plus the typed Prisma code only
    // (architecture.md Sec8.B); raw-SQL errors all surface as P2010 (53.7).
    console.error({
      operation: "reserveLoginAttempt",
      reason: "unexpected_failure",
      accountId,
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return false;
  }
}
