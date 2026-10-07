import { prisma } from "@/lib/prisma";

import {
  EMAIL_OTP_CLEANUP_BATCH_SIZE,
  EMAIL_OTP_CLEANUP_MAX_BATCHES,
  EMAIL_OTP_SEND_WINDOW_MS,
} from "../constants";

// Sweeps dead EmailOtpChallenge rows (54.3.2.8). Once sentAt is older than
// the send window the code has expired and the window has rolled over, so
// issueEmailOtp's next send would rewrite every field anyway -- deleting the
// row is invisible. Same bounded raw-SQL batching as pruneExpiredSessions,
// but the cutoff is taken once from the Node clock: issueEmailOtp writes
// sentAt and judges the window on that clock, and the pg adapter binds a
// Date as a UTC timestamp, matching how Prisma stores the column.
//
// Concurrency: Postgres re-checks the outer sentAt predicate against a row
// a concurrent rollover refreshed while this DELETE waited on its lock, so
// a just-sent code is skipped rather than deleted. If the DELETE wins
// instead, issueEmailOtp re-creates the row. Errors propagate to the
// caller, which owns the try/catch and response mapping.
export async function pruneExpiredEmailOtpChallenges(): Promise<number> {
  const cutoff = new Date(Date.now() - EMAIL_OTP_SEND_WINDOW_MS);
  let totalDeleted = 0;

  for (let batch = 0; batch < EMAIL_OTP_CLEANUP_MAX_BATCHES; batch += 1) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "EmailOtpChallenge"
      WHERE "sentAt" < ${cutoff}
        AND id IN (
          SELECT id FROM "EmailOtpChallenge"
          WHERE "sentAt" < ${cutoff}
          LIMIT ${EMAIL_OTP_CLEANUP_BATCH_SIZE}
        )
    `;

    totalDeleted += deleted;

    // A short batch means no dead rows remain (or a refreshed row was
    // skipped); anything left over goes on the next scheduled run.
    if (deleted < EMAIL_OTP_CLEANUP_BATCH_SIZE) break;
  }

  return totalDeleted;
}
