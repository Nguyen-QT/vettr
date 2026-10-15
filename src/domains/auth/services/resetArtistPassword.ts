import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { LoginResult, ResetArtistPasswordInput } from "../types";
import { createSession } from "./createSession";
import { hashPassword } from "./hashPassword";
import { hashPasswordResetToken } from "./hashPasswordResetToken";
import { recordAuditEvent } from "./recordAuditEvent";

const INVALID_RESULT: LoginResult = {
  success: false,
  error: INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
};

// Thrown inside the transaction when the link is already gone, or the
// account changed or was deleted, so any password write that already ran
// rolls back -- returning would commit it.
class LostResetRaceError extends Error {}

// Domain Service (71.1.2.4): redeems an emailed password-reset link -- the
// redeem half of 71.1.2.3. Sets the new password, clears the login lockout,
// deletes every link and session for the account, and signs the artist
// straight in, so whoever keeps the lock armed gets no window to re-arm it
// before the artist is back in. Every rejection is the same generic error.
//
// This is the one sanctioned exception to Phase 54's rule that an
// ARTIST-home account never gets a session from emailed proof: the same
// transaction replaces the password, so the inbox already controls the
// account.
//
// The token is looked up by its sha256, and a miss returns before scrypt.
// hashPassword runs outside the transaction so scrypt never holds the
// Account row lock.
//
// Concurrency (architecture.md Sec8.A): the Account update is the
// transaction's first statement, so it waits on an in-flight
// issuePasswordResetToken's FOR UPDATE lock, and the later "delete every
// other link" step then sees (and removes) the link that issue inserted.
// Parallel resets with one link serialise on the same row; each loser's
// guarded delete finds the link gone and throws, rolling back its own
// password write.
//
// - The update re-checks the ARTIST-home guard in its own WHERE, which
//   Postgres re-evaluates on the locked row, so the pre-check above can't go
//   stale (Sec8.A). An account deleted or made ineligible mid-reset updates
//   0 rows and throws as a lost race -- updateMany, not update, which would
//   throw P2025 instead. That path writes no audit row: 0 rows can't tell a
//   deletion from a role change, and only operator SQL reaches it.
// - The guarded delete takes a fresh Node-clock `now`, so a link that
//   expires while scrypt runs is rejected.
export async function resetArtistPassword(input: ResetArtistPasswordInput): Promise<LoginResult> {
  let accountId: string | undefined;

  try {
    const link = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashPasswordResetToken(input.token) },
      select: {
        id: true,
        expiresAt: true,
        account: { select: { id: true, role: true, artistId: true } },
      },
    });

    // An unknown or expired link writes no audit row -- there's no account
    // to attach it to (Phase 72).
    if (!link || link.expiresAt <= new Date()) {
      return INVALID_RESULT;
    }

    const { account } = link;
    accountId = account.id;

    // The link is left unconsumed -- nothing was reset. accountId (not
    // attemptedEmail): the link has proven the inbox.
    const { artistId } = account;
    if (account.role !== "ARTIST" || artistId === null) {
      await recordAuditEvent({
        eventType: "PASSWORD_RESET",
        outcome: "REJECTED",
        reasonCode: account.role !== "ARTIST" ? "ROLE_MISMATCH" : "NOT_LINKED_TO_ARTIST",
        accountId: account.id,
      });
      return INVALID_RESULT;
    }

    const passwordHash = await hashPassword(input.newPassword);

    const session = await prisma.$transaction(async (tx) => {
      const { count: updated } = await tx.account.updateMany({
        where: { id: account.id, role: "ARTIST", artistId: { not: null } },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      });
      if (updated !== 1) {
        throw new LostResetRaceError();
      }

      const { count: consumed } = await tx.passwordResetToken.deleteMany({
        where: { id: link.id, expiresAt: { gt: new Date() } },
      });
      if (consumed !== 1) {
        // A concurrent reset with the same link got there first, or the
        // link expired mid-reset.
        throw new LostResetRaceError();
      }

      await tx.passwordResetToken.deleteMany({ where: { accountId: account.id } });
      await tx.session.deleteMany({ where: { accountId: account.id } });
      return createSession(account.id, "ARTIST", tx);
    });

    // After the transaction resolves, so a rollback never records a reset
    // that didn't happen.
    await recordAuditEvent({
      eventType: "PASSWORD_RESET",
      outcome: "SUCCESS",
      reasonCode: "PASSWORD_RESET_WITH_EMAIL_LINK",
      accountId: account.id,
    });

    return {
      success: true,
      sessionId: session.id,
      expiresAt: session.expiresAt,
      artistId,
    };
  } catch (error) {
    if (error instanceof LostResetRaceError) {
      return INVALID_RESULT;
    }

    // Fixed allowlist plus the opaque account id and the typed Prisma code
    // only -- never the token, its hash, the new password or the raw driver
    // message (architecture.md Sec8.B).
    console.error({
      operation: "resetArtistPassword",
      reason: "unexpected_failure",
      accountId,
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return { success: false, error: RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE };
  }
}
