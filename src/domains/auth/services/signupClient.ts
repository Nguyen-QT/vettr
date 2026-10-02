import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  NO_BOOKING_FOUND_ERROR_MESSAGE,
} from "../constants";
import type { LoginInput, SignupClientResult } from "../types";
import { generateEmailVerificationCode } from "./generateEmailVerificationCode";
import { hashPassword } from "./hashPassword";
import { sendVerificationEmail } from "./sendVerificationEmail";

// Client accounts are opt-in and only ever *link* to a ClientProfile
// that already exists from a prior guest booking (CLAUDE.md 5.2) --
// this never creates one. A client with no booking history has
// nothing yet to attach an account to; they're pointed at submitting a
// request first instead. ClientProfile.email isn't unique, so a
// matching signup links to whichever row is found first -- the same
// known limitation already documented for the instagramHandle-mismatch
// case.
//
// No session is issued here (CLAUDE.md 27.3.2.4) -- verifyEmailCode is
// the only path to a session for a fresh signup. The hashed code is
// written in the same create as the Account, so the stored intent always
// exists before the email goes out (architecture.md §6) and there's no
// window where an account exists without a code.
export async function signupClient(input: LoginInput): Promise<SignupClientResult> {
  const clientProfile = await prisma.clientProfile.findFirst({
    where: { email: input.email },
    include: { account: true },
  });

  if (!clientProfile) {
    return { success: false, error: NO_BOOKING_FOUND_ERROR_MESSAGE };
  }

  const existingAccount = clientProfile.account;
  if (existingAccount && existingAccount.emailVerifiedAt !== null) {
    return { success: false, error: ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE };
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const { code, codeHash, expiresAt } = generateEmailVerificationCode(now);

  if (existingAccount) {
    // Pre-verification squatting defense (27.3.2.8): an *unverified*
    // account is reclaimable, so the real owner can always replace a
    // squatter's password. The atomic WHERE guards a concurrent verify
    // (emailVerifiedAt) and shares resendVerificationCode's cooldown so
    // signup can't be used to email-bomb the address. A concurrent
    // verifyEmailCode consume is guarded on the old code hash, which this
    // overwrites, so it can never yield a session for the replaced
    // password. count === 0 (cooldown, or verified meanwhile) returns the
    // same pending result with no send -- indistinguishable from here.
    const cooldownCutoff = new Date(now.getTime() - EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
    const { count } = await prisma.account.updateMany({
      where: {
        id: existingAccount.id,
        emailVerifiedAt: null,
        OR: [
          { emailVerificationCodeSentAt: null },
          { emailVerificationCodeSentAt: { lte: cooldownCutoff } },
        ],
      },
      data: {
        passwordHash,
        emailVerificationCodeHash: codeHash,
        emailVerificationCodeExpiresAt: expiresAt,
        emailVerificationCodeSentAt: now,
        emailVerificationAttempts: 0,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    if (count > 0) {
      await sendVerificationEmail(input.email, code);
    }

    return { success: true, pendingVerification: true, clientProfileId: clientProfile.id };
  }

  await prisma.account.create({
    data: {
      email: input.email,
      passwordHash,
      role: "CLIENT",
      clientProfileId: clientProfile.id,
      emailVerificationCodeHash: codeHash,
      emailVerificationCodeExpiresAt: expiresAt,
      emailVerificationCodeSentAt: now,
    },
  });

  // Result deliberately ignored -- sendVerificationEmail never throws and
  // already logs its own non-PII failure reason. A failed send lands on
  // the same pending-verification screen, where the resend button
  // (resendVerificationCode) is the recovery path.
  await sendVerificationEmail(input.email, code);

  return { success: true, pendingVerification: true, clientProfileId: clientProfile.id };
}
