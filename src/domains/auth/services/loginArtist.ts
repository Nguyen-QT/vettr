import { prisma } from "@/lib/prisma";

import { INVALID_CREDENTIALS_ERROR_MESSAGE } from "../constants";
import type { LoginInput, LoginResult } from "../types";
import { createSession } from "./createSession";
import { verifyPassword } from "./verifyPassword";

// Artist accounts are manually provisioned (CLAUDE.md 5.1) -- this only
// authenticates against an existing Account row, never creates one.
// Scoped to role ARTIST so a CLIENT account's credentials (even if the
// email happened to collide, which it can't -- email is globally
// unique) could never log in to the artist dashboard.
export async function loginArtist(input: LoginInput): Promise<LoginResult> {
  const account = await prisma.account.findUnique({
    where: { email: input.email },
  });

  if (!account || account.role !== "ARTIST" || !account.artistId) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const passwordMatches = await verifyPassword(input.password, account.passwordHash);
  if (!passwordMatches) {
    return { success: false, error: INVALID_CREDENTIALS_ERROR_MESSAGE };
  }

  const session = await createSession(account.id);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    artistId: account.artistId,
  };
}
