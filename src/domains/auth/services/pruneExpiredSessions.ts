import { prisma } from "@/lib/prisma";

import {
  SESSION_CLEANUP_BATCH_SIZE,
  SESSION_CLEANUP_MAX_BATCHES,
} from "../constants";

// Sweeps expired Session rows (CLAUDE.md 27.4). Prisma's deleteMany has no
// LIMIT, so this loops a bounded raw-SQL batched delete instead. The delete is
// idempotent (an overlapping run just deletes 0 rows), and `now()` is
// evaluated by Postgres to avoid app/DB clock skew. Errors propagate to the
// caller, which owns the try/catch and response mapping.
export async function pruneExpiredSessions(): Promise<number> {
  let totalDeleted = 0;

  for (let batch = 0; batch < SESSION_CLEANUP_MAX_BATCHES; batch += 1) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM "Session"
      WHERE id IN (
        SELECT id FROM "Session"
        WHERE "expiresAt" < now()
        LIMIT ${SESSION_CLEANUP_BATCH_SIZE}
      )
    `;

    totalDeleted += deleted;

    // A short batch means no expired rows remain; skip the confirming query.
    if (deleted < SESSION_CLEANUP_BATCH_SIZE) break;
  }

  return totalDeleted;
}
