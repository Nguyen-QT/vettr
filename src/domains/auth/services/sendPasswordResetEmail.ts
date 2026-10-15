import { captureEmail, getEmailCaptureSinkPath } from "@/lib/emailCaptureSink";
import { resend } from "@/lib/resend";

import { ARTIST_RESET_PASSWORD_PATH, PASSWORD_RESET_TOKEN_EXPIRY_MS } from "../constants";
import type { SendPasswordResetEmailResult } from "../types";

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = Math.round(PASSWORD_RESET_TOKEN_EXPIRY_MS / 1000 / 60);

// Domain Service (71.1.2.2): emails a freshly issued artist password-reset
// link. Works like sendVerificationEmail and follows architecture.md §6 --
// the Resend call is wrapped in its own try/catch and never rethrows, and
// Resend's `{ error }` result (an API-level rejection) counts as a failure
// too; a thrown error only covers network-level failures.
//
// The link uses the same NEXT_PUBLIC_APP_URL fallback as
// createConnectOnboardingLink, read per call so it isn't fixed at import.
//
// Never returns a message string (see SendPasswordResetEmailResult): the
// caller answers every outcome with the same generic "link sent" copy, so
// there is nothing failure-specific to surface. Logs a fixed, non-PII
// allowlist only -- never the recipient, the token or the link (which
// carries the token), nor Resend's message text, which can echo the
// recipient address back.
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<SendPasswordResetEmailResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resetLink = `${appUrl}${ARTIST_RESET_PASSWORD_PATH}?${new URLSearchParams({ token }).toString()}`;

  if (getEmailCaptureSinkPath()) {
    try {
      await captureEmail({ to: email, resetLink, sentAt: new Date().toISOString() });
      return { success: true };
    } catch {
      console.error({
        operation: "sendPasswordResetEmail",
        reason: "capture_sink_write_failed",
      });
      return { success: false };
    }
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error({
      operation: "sendPasswordResetEmail",
      reason: "missing_email_from_env",
    });
    return { success: false };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Reset your Vettr password",
      text: [
        "Someone asked to reset the password for your Vettr artist account.",
        "",
        "Choose a new password here:",
        resetLink,
        "",
        `This link expires in ${PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes and can be used once.`,
        "",
        "If this wasn't you, you can ignore this email. Your password hasn't changed.",
      ].join("\n"),
    });

    if (error) {
      console.error({
        operation: "sendPasswordResetEmail",
        reason: "resend_api_error",
        errorCode: error.name,
        statusCode: error.statusCode,
      });
      return { success: false };
    }

    return { success: true };
  } catch {
    console.error({
      operation: "sendPasswordResetEmail",
      reason: "send_threw",
    });
    return { success: false };
  }
}
