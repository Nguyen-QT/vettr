import { captureEmail, getEmailCaptureSinkPath } from "@/lib/emailCaptureSink";
import { resend } from "@/lib/resend";

import { EMAIL_VERIFICATION_CODE_EXPIRY_MS } from "../constants";
import type { SendVerificationEmailResult } from "../types";

const EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES = Math.round(
  EMAIL_VERIFICATION_CODE_EXPIRY_MS / 1000 / 60
);

// Domain Service (CLAUDE.md 27.3.2.3): emails a freshly generated
// verification code. Follows architecture.md §6 exactly, mirroring
// createConnectOnboardingLink.ts -- the Resend call is wrapped in its
// own try/catch and never rethrows. Resend's SDK additionally reports
// API-level rejections (invalid address, quota exceeded, etc.) via a
// `{ error }` result instead of throwing, so that branch is treated as
// a failure too; a thrown error only covers network-level failures.
//
// Never returns a message string (see SendVerificationEmailResult):
// the caller's UX is identical either way -- proceed to
// pending-verification and let the user hit "resend" -- so there is
// nothing failure-specific to surface, and nothing failure-specific to
// log beyond a fixed, non-PII allowlist (recipient/code/Resend message
// text are never logged, since Resend validation errors can echo the
// recipient address back in `error.message`).
export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<SendVerificationEmailResult> {
  if (getEmailCaptureSinkPath()) {
    try {
      await captureEmail({ to: email, code, sentAt: new Date().toISOString() });
      return { success: true };
    } catch {
      console.error({
        operation: "sendVerificationEmail",
        reason: "capture_sink_write_failed",
      });
      return { success: false };
    }
  }

  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.error({
      operation: "sendVerificationEmail",
      reason: "missing_email_from_env",
    });
    return { success: false };
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Your Vettr verification code",
      text: `Your verification code is ${code}. It expires in ${EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES} minutes.`,
    });

    if (error) {
      console.error({
        operation: "sendVerificationEmail",
        reason: "resend_api_error",
        errorCode: error.name,
        statusCode: error.statusCode,
      });
      return { success: false };
    }

    return { success: true };
  } catch {
    console.error({
      operation: "sendVerificationEmail",
      reason: "send_threw",
    });
    return { success: false };
  }
}
