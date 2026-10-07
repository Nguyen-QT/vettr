import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { SESSION_DURATION_MS } from "../constants";

// activeRole is required, not defaulted from a lookup, because every caller
// already has the account (and its role) in hand from the login/signup
// service that's about to create this session (CLAUDE.md 26.1.2.2).
//
// tx lets a caller create the session inside its own transaction, so it
// commits or rolls back with the write that earned it (54.3.2.7: the OTP
// consume). Defaults to the global client for every other caller.
export async function createSession(
  accountId: string,
  activeRole: "ARTIST" | "CLIENT",
  tx: Prisma.TransactionClient = prisma
) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  return tx.session.create({
    data: { accountId, expiresAt, activeRole },
  });
}
