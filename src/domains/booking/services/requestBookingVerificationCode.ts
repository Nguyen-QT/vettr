import { REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE } from "@/domains/auth/constants";
import { requestBookingSubmissionCode } from "@/domains/auth/services/requestBookingSubmissionCode";
import { Prisma } from "@/generated/prisma/client";

import type {
  RequestBookingVerificationCodeInput,
  RequestBookingVerificationCodeResult,
} from "../types";
import { validateComplexity } from "./validateComplexity";

// Domain Service (54.5.2.4): the server prevalidation auth's
// requestBookingSubmissionCode leaves to its caller. The controller
// (54.5.3.4) owns the schema parse; this screens the parsed draft with
// validateComplexity and only then asks auth for the code, so a rejected
// draft never issues one or spends the address's cooldown and send cap.
// A draft edited after the code is sent is re-checked at submit
// (submitBookingRequestWithEmailOtp, 54.5.2.5) before the code is consumed.
//
// Only the email crosses into auth (architecture.md Sec2). A content
// rejection is a product filter, not a failure, so it isn't logged.
export async function requestBookingVerificationCode(
  input: RequestBookingVerificationCodeInput
): Promise<RequestBookingVerificationCodeResult> {
  try {
    const complexityCheck = validateComplexity({
      tier: input.tier,
      clientNotes: input.clientNotes,
      designTags: input.designTags,
      aestheticTags: input.aestheticTags,
    });
    if (!complexityCheck.success) {
      return complexityCheck;
    }

    return await requestBookingSubmissionCode({ email: input.email });
  } catch (error) {
    // auth's send already catches its own failures; this keeps that
    // guarantee from depending on auth staying that way (architecture.md
    // Sec8.B). Fixed allowlist plus the typed Prisma code only -- never the
    // email or the raw driver message, which can echo it.
    console.error({
      operation: "requestBookingVerificationCode",
      reason: "unexpected_failure",
      errorCode: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });
    return { success: false, error: REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE };
  }
}
