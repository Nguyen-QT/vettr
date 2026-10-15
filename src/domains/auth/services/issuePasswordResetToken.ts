import { prisma } from "@/lib/prisma";

import { MAX_LIVE_PASSWORD_RESET_TOKENS, PASSWORD_RESET_REQUEST_COOLDOWN_MS } from "../constants";
import type { IssuePasswordResetTokenResult } from "../types";
import { generatePasswordResetToken } from "./generatePasswordResetToken";

// Domain Service (71.1.2.1): the single write choke point that issues an
// artist password-reset link token for one account. Only the hash is
// stored; the plaintext is returned so the caller can email it.
// Deliberately sends nothing and catches nothing -- the caller owns
// eligibility, the send (with its own timeout), and the generic error +
// non-PII log for a DB failure (mirrors issueEmailOtp).
//
// Guards: a 60s cooldown on the newest live link's createdAt, and a cap on
// *live* links per account. Issuing never cancels older links, so whenever
// a request is refused the inbox already holds a working one.
//
// Concurrency (architecture.md Sec8.A): one interactive transaction that
// first locks the Account row with SELECT ... FOR UPDATE, so concurrent
// requests for the same account run one at a time. Under READ COMMITTED
// each later statement sees the earlier request's committed insert, so a
// burst issues exactly one link. The lock also serialises this against a
// reset, which updates the same Account row.
//
// - No locked row means the account was deleted after the caller's lookup:
//   nothing to issue, rather than a P2003 on the insert.
// - Expired rows are deleted before counting. That delete is bounded,
//   because the cap means an account never holds more than 3 rows.
// - Every time comes from the Node clock, including createdAt (which
//   overrides the column's DB-clock default), so the cooldown, expiry and
//   the reset's own `expiresAt > now` check all judge on one clock.
export async function issuePasswordResetToken(
  accountId: string
): Promise<IssuePasswordResetTokenResult> {
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - PASSWORD_RESET_REQUEST_COOLDOWN_MS);
  const { token, tokenHash, expiresAt } = generatePasswordResetToken(now);

  return prisma.$transaction(async (tx): Promise<IssuePasswordResetTokenResult> => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Account" WHERE "id" = ${accountId} FOR UPDATE
    `;
    if (locked.length === 0) {
      return { issued: false };
    }

    await tx.passwordResetToken.deleteMany({
      where: { accountId, expiresAt: { lte: now } },
    });

    const live = await tx.passwordResetToken.findMany({
      where: { accountId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
      take: MAX_LIVE_PASSWORD_RESET_TOKENS,
    });
    if (
      live.length >= MAX_LIVE_PASSWORD_RESET_TOKENS ||
      (live.length > 0 && live[0].createdAt > cooldownCutoff)
    ) {
      return { issued: false };
    }

    await tx.passwordResetToken.create({
      data: { accountId, tokenHash, expiresAt, createdAt: now },
    });
    return { issued: true, token };
  });
}
