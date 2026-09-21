import { prisma } from "@/lib/prisma";

import { SESSION_DURATION_MS } from "../constants";

export async function createSession(accountId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  return prisma.session.create({
    data: { accountId, expiresAt },
  });
}
