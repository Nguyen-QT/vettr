import { VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE } from "@/domains/auth/constants";
import { verifyEmailOtpAndProvisionClient } from "@/domains/auth/services/verifyEmailOtpAndProvisionClient";
import { Prisma } from "@/generated/prisma/client";

import { BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE } from "../constants";
import type {
  CreateBookingRequestInput,
  SubmitBookingRequestWithEmailOtpInput,
  SubmitBookingRequestWithEmailOtpResult,
  VerifiedClientSession,
} from "../types";
import { createBookingRequest } from "./createBookingRequest";
import { validateComplexity } from "./validateComplexity";

const OPERATION = "submitBookingRequestWithEmailOtp";

type Verification =
  | { success: true; session: VerifiedClientSession; clientProfileId: string }
  | { success: false; error: string };

function prismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

// Everything up to and including the redeem; no failure here leaves a
// session. The draft is re-screened first: it may have been edited since
// requestBookingVerificationCode (54.5.2.4) checked it, and a rejection
// here never reaches auth, so it doesn't spend one of the code's attempts.
// Only the email, code and handle cross into auth (architecture.md Sec2).
async function screenAndVerify(
  input: SubmitBookingRequestWithEmailOtpInput
): Promise<Verification> {
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

    const verification = await verifyEmailOtpAndProvisionClient({
      email: input.email,
      code: input.code,
      instagramHandle: input.instagramHandle,
    });
    if (!verification.success) {
      return { success: false, error: verification.error };
    }

    return {
      success: true,
      session: { sessionId: verification.sessionId, expiresAt: verification.expiresAt },
      clientProfileId: verification.clientProfileId,
    };
  } catch (error) {
    // auth already catches its own failures; this keeps that guarantee
    // from depending on auth staying that way (architecture.md Sec8.B).
    console.error({
      operation: OPERATION,
      reason: "unexpected_failure",
      errorCode: prismaErrorCode(error),
    });
    return { success: false, error: VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE };
  }
}

// Built field by field, never spread: clientProfileId is always the one
// verification resolved, and nothing else in the payload -- the handle,
// email, code or any stray key -- reaches the booking write.
function toCreateBookingRequestInput(
  input: SubmitBookingRequestWithEmailOtpInput,
  clientProfileId: string
): CreateBookingRequestInput {
  return {
    clientProfileId,
    artistId: input.artistId,
    designReferenceImageUrls: input.designReferenceImageUrls,
    tier: input.tier,
    clientBudgetRange: input.clientBudgetRange,
    designTags: input.designTags,
    aestheticTags: input.aestheticTags,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    clientNotes: input.clientNotes,
    requestedDate: input.requestedDate,
    requestedTime: input.requestedTime,
    clientMaxEndTime: input.clientMaxEndTime,
    paymentMethod: input.paymentMethod,
  };
}

// Application Service (54.5.2.5): the email-code submit -- validateComplexity,
// then auth's verifyEmailOtpAndProvisionClient (redeem + provision + CLIENT
// session in one transaction), then createBookingRequest (54.5.2.3, the
// write shared with the signed-in path). booking -> auth is the allowed
// direction. The controller (54.5.3.4) owns the schema parse and the artist
// lookup; booking services never read Artist.
//
// Failure split (architecture.md Sec6.2): once the code is redeemed the
// session is committed, so a booking failure after that point still
// returns it. The controller sets the cookie whenever session is present
// and the client resubmits via the signed-in path with no second code --
// never retried here (Sec6.3). An unknown artistId that slipped past the
// controller lands on that same path.
export async function submitBookingRequestWithEmailOtp(
  input: SubmitBookingRequestWithEmailOtpInput
): Promise<SubmitBookingRequestWithEmailOtpResult> {
  const verification = await screenAndVerify(input);
  if (!verification.success) {
    return { success: false, error: verification.error, session: null };
  }
  const { session } = verification;

  let errorCode: string | undefined;
  try {
    const booking = await createBookingRequest(
      toCreateBookingRequestInput(input, verification.clientProfileId)
    );
    if (booking.success) {
      return { success: true, bookingRequestId: booking.bookingRequestId, session };
    }
  } catch (error) {
    errorCode = prismaErrorCode(error);
  }

  // createBookingRequest logs its own cause; this records the split
  // outcome -- a verified client with no booking. Fixed allowlist plus the
  // typed Prisma code only, never the draft or the raw driver message.
  console.error({
    operation: OPERATION,
    reason: "booking_failed_after_verification",
    errorCode,
  });
  return { success: false, error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE, session };
}
