import { Prisma } from "@/generated/prisma/client";
import { normalizeEmail } from "@/lib/email";

import { REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE } from "../constants";
import type {
  RequestBookingSubmissionCodeInput,
  RequestBookingSubmissionCodeResult,
} from "../types";
import { issueEmailOtp } from "./issueEmailOtp";
import { sendVerificationEmail } from "./sendVerificationEmail";

// Domain Service (54.5.2.1): issues and emails a BOOKING_SUBMISSION code
// for a booking draft's email. The caller (booking's
// requestBookingVerificationCode, 54.5.2.4) owns the full server
// prevalidation -- schema + validateComplexity -- before calling this.
//
// Unlike requestClientSignInCode, a booking code is sent to every address
// with no account lookup, so the response can't enumerate accounts and
// there is no response floor or send timeout. Account resolution happens
// only after the code is proven (verifyEmailOtpAndProvisionClient).
//
// Cooldown, send cap and concurrent double-requests are all owned by
// issueEmailOtp's atomic guards -- a blocked issue is the same success
// with no send. A failed send keeps the cooldown (no retry storm against a
// degraded provider); sendVerificationEmail never rejects and logs its own
// reason.
export async function requestBookingSubmissionCode(
  input: RequestBookingSubmissionCodeInput
): Promise<RequestBookingSubmissionCodeResult> {
  try {
    const email = normalizeEmail(input.email);

    const otp = await issueEmailOtp({ email, purpose: "BOOKING_SUBMISSION" });
    if (otp.issued) {
      await sendVerificationEmail(email, otp.code);
    }

    return { success: true };
  } catch (error) {
    // Fixed allowlist plus the typed Prisma code only -- never the email,
    // the code, or the raw driver message, which can echo the email
    // (architecture.md Sec8.B).
    console.error({
      operation: "requestBookingSubmissionCode",
      reason: "unexpected_failure",
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return { success: false, error: REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE };
  }
}
