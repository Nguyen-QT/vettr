import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
  NO_BOOKING_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { ClientAuthResult, LoginInput } from "../types";
import { createSession } from "./createSession";
import { hashPassword } from "./hashPassword";

// Client accounts are opt-in and only ever *link* to a ClientProfile
// that already exists from a prior guest booking (CLAUDE.md 5.2) --
// this never creates one. A client with no booking history has
// nothing yet to attach an account to; they're pointed at submitting a
// request first instead. ClientProfile.email isn't unique, so a
// matching signup links to whichever row is found first -- the same
// known limitation already documented for the instagramHandle-mismatch
// case.
export async function signupClient(input: LoginInput): Promise<ClientAuthResult> {
  const clientProfile = await prisma.clientProfile.findFirst({
    where: { email: input.email },
    include: { account: true },
  });

  if (!clientProfile) {
    return { success: false, error: NO_BOOKING_FOUND_ERROR_MESSAGE };
  }

  if (clientProfile.account) {
    return { success: false, error: ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE };
  }

  const passwordHash = await hashPassword(input.password);
  const account = await prisma.account.create({
    data: {
      email: input.email,
      passwordHash,
      role: "CLIENT",
      clientProfileId: clientProfile.id,
    },
  });

  const session = await createSession(account.id, account.role);

  return {
    success: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    clientProfileId: clientProfile.id,
  };
}
