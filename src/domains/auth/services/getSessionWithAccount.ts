import { prisma } from "@/lib/prisma";

import type { SessionWithAccount } from "../types";

// Null for a missing OR expired session -- callers (the route-protection
// middleware, 5.1.4) don't need to distinguish the two, both mean
// "not logged in".
export async function getSessionWithAccount(
  sessionId: string
): Promise<SessionWithAccount | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { account: true },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    accountId: session.account.id,
    role: session.account.role,
    activeRole: session.activeRole,
    artistId: session.account.artistId,
    clientProfileId: session.account.clientProfileId,
  };
}
