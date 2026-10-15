import { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  ARTIST_PASSWORD_RESET_REQUEST_RESPONSE_FLOOR_MS,
  EMAIL_OTP_SEND_TIMEOUT_MS,
  REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type {
  RequestArtistPasswordResetInput,
  RequestArtistPasswordResetResult,
  SendPasswordResetEmailResult,
} from "../types";
import { issuePasswordResetToken } from "./issuePasswordResetToken";
import { sendPasswordResetEmail } from "./sendPasswordResetEmail";

const SUCCESS: RequestArtistPasswordResetResult = { success: true };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend's SDK takes no AbortSignal, so a send that misses the timeout
// can't be cancelled -- it's abandoned and treated as a failed send (the
// artist requests again after the cooldown, or uses a link already in
// their inbox). sendPasswordResetEmail never rejects, so the orphaned
// promise can't surface as an unhandled rejection.
async function sendWithTimeout(email: string, token: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timed_out">((resolve) => {
    timer = setTimeout(() => resolve("timed_out"), EMAIL_OTP_SEND_TIMEOUT_MS);
  });

  try {
    const outcome: SendPasswordResetEmailResult | "timed_out" = await Promise.race([
      sendPasswordResetEmail(email, token),
      timedOut,
    ]);
    if (outcome === "timed_out") {
      console.error({ operation: "requestArtistPasswordReset", reason: "send_timed_out" });
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestLink(email: string): Promise<RequestArtistPasswordResetResult> {
  try {
    // lockedUntil is deliberately not read: a locked artist still gets a
    // link -- that's the point of the reset.
    const account = await prisma.account.findUnique({
      where: { email },
      select: { id: true, role: true, artistId: true },
    });

    // Only ARTIST-home accounts (incl. dual-role) hold a password; a CLIENT
    // account signs in by email code and has nothing to reset.
    if (!account || account.role !== "ARTIST" || account.artistId === null) {
      return SUCCESS;
    }

    const issue = await issuePasswordResetToken(account.id);
    if (issue.issued) {
      await sendWithTimeout(email, issue.token);
    }

    return SUCCESS;
  } catch (error) {
    // Fixed allowlist plus the typed Prisma code only -- never the email,
    // the token, or the raw driver message, which can echo the email
    // (architecture.md Sec8.B).
    console.error({
      operation: "requestArtistPasswordReset",
      reason: "unexpected_failure",
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return { success: false, error: REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE };
  }
}

// Domain Service (71.1.2.3): requests an emailed password-reset link for an
// artist. Only an ARTIST account with a linked Artist is issued and sent a
// link; every other address gets the identical success with no email, so
// the request can neither enumerate artist accounts nor bomb arbitrary
// inboxes. Mirrors requestClientSignInCode.
//
// Timing: every outcome, including the DB-error path, is padded to a fixed
// response floor (a sleep -- dummy work can't imitate Resend's latency),
// and the send is capped by a timeout below the floor. DB work slow enough
// to exceed the floor still leaks; per-IP limits are deferred to 53.6.
//
// Cooldown, the live-link cap, concurrent double-requests and an account
// deleted after the lookup are all owned by issuePasswordResetToken's
// row-locked transaction -- a refused issue is the same success with no
// send. A failed or timed-out send keeps the cooldown (no retry storm
// against a degraded provider).
export async function requestArtistPasswordReset(
  input: RequestArtistPasswordResetInput
): Promise<RequestArtistPasswordResetResult> {
  const startedAt = Date.now();
  const result = await requestLink(normalizeEmail(input.email));

  const remainingMs = ARTIST_PASSWORD_RESET_REQUEST_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await sleep(remainingMs);
  }

  return result;
}
