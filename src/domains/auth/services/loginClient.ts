import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import type { ClientAuthResult, LoginInput } from "../types";
import { createSession } from "./createSession";
import { verifyPassword } from "./verifyPassword";

// Mirrors loginArtist.ts, scoped to role CLIENT and a clientProfileId
// instead of an artistId (CLAUDE.md 5.2).
export async function loginClient(input: LoginInput): Promise<ClientAuthResult> {
  const account = await prisma.account.findUnique({
    where: { email: input.email },
  });

  if (!account || account.role !== "CLIENT" || !account.clientProfileId) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const passwordMatches = await verifyPassword(input.password, account.passwordHash);
  if (!passwordMatches) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const session = await createSession(account.id, account.role);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    clientProfileId: account.clientProfileId,
  };
}
