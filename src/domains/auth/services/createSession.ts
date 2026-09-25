import { prisma } from "@/lib/prisma";

import { SESSION_DURATION_MS } from "../constants";

// activeRole is required, not defaulted from a lookup, because every caller
// already has the account (and its role) in hand from the login/signup
// service that's about to create this session (CLAUDE.md 26.1.2.2).
export async function createSession(
  accountId: string,
  activeRole: "ARTIST" | "CLIENT"
) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  return prisma.session.create({
    data: { accountId, expiresAt, activeRole },
  });
}
