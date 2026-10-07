import { normalizeEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

import {
  CLIENT_SIGN_IN_CODE_RESPONSE_FLOOR_MS,
  EMAIL_OTP_SEND_TIMEOUT_MS,
  REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type {
  RequestClientSignInCodeInput,
  RequestClientSignInCodeResult,
  SendVerificationEmailResult,
} from "../types";
import { issueEmailOtp } from "./issueEmailOtp";
import { sendVerificationEmail } from "./sendVerificationEmail";

const SUCCESS: RequestClientSignInCodeResult = { success: true };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend's SDK takes no AbortSignal, so a send that misses the timeout
// can't be cancelled -- it's abandoned and treated as a failed send (the
// user resends after the cooldown). It keeps running for the rest of the
// floor, and sendVerificationEmail never rejects, so the orphaned promise
// can't surface as an unhandled rejection.
async function sendWithTimeout(email: string, code: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timed_out">((resolve) => {
    timer = setTimeout(() => resolve("timed_out"), EMAIL_OTP_SEND_TIMEOUT_MS);
  });

  try {
    const outcome: SendVerificationEmailResult | "timed_out" = await Promise.race([
      sendVerificationEmail(email, code),
      timedOut,
    ]);
    if (outcome === "timed_out") {
      console.error({ operation: "requestClientSignInCode", reason: "send_timed_out" });
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestCode(email: string): Promise<RequestClientSignInCodeResult> {
  try {
    const account = await prisma.account.findUnique({
      where: { email },
      select: { role: true, clientProfileId: true },
    });

    // ARTIST-home accounts (incl. dual-role) are never sent a sign-in
    // code -- email access must not bypass the artist password.
    if (!account || account.role !== "CLIENT" || account.clientProfileId === null) {
      return SUCCESS;
    }

    const otp = await issueEmailOtp({ email, purpose: "CLIENT_SIGN_IN" });
    if (otp.issued) {
      await sendWithTimeout(email, otp.code);
    }

    return SUCCESS;
  } catch {
    // Fixed allowlist only -- never the email, the code, or the raw
    // driver error (architecture.md Sec8.B).
    console.error({ operation: "requestClientSignInCode", reason: "unexpected_failure" });
    return { success: false, error: REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE };
  }
}

// Domain Service (54.3.2.6, implements 27.7's direction): requests a
// CLIENT_SIGN_IN code for the portal's passwordless sign-in. Only a CLIENT
// account with a linked ClientProfile is issued and sent a code; every
// other address gets the identical success with no email, so the request
// can neither enumerate accounts nor bomb arbitrary inboxes.
//
// Timing: every outcome, including the DB-error path, is padded to a
// fixed response floor (a sleep -- dummy work can't imitate Resend's
// latency), and the send is capped by a timeout below the floor. DB work
// slow enough to exceed the floor still leaks; per-IP limits are deferred
// to Phase 52.
//
// Cooldown, send cap and concurrent double-requests are all owned by
// issueEmailOtp's atomic guards -- a blocked issue is the same success
// with no send. A failed or timed-out send keeps the cooldown (no retry
// storm against a degraded provider, mirroring resendVerificationCode).
export async function requestClientSignInCode(
  input: RequestClientSignInCodeInput
): Promise<RequestClientSignInCodeResult> {
  const startedAt = Date.now();
  const result = await requestCode(normalizeEmail(input.email));

  const remainingMs = CLIENT_SIGN_IN_CODE_RESPONSE_FLOOR_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await sleep(remainingMs);
  }

  return result;
}
