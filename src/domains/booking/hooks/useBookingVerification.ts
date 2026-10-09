"use client";

import { useState, useTransition } from "react";
import { useWatch } from "react-hook-form";
import type { FieldErrors, UseFormReturn } from "react-hook-form";

import {
  EMAIL_OTP_CODE_LENGTH,
  REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";
import { useResendCooldown } from "@/domains/auth/hooks/useResendCooldown";
import {
  requestBookingVerificationCodeAction,
  submitBookingRequest,
  submitBookingRequestWithCodeAction,
} from "@/domains/booking/actions";
import { submitBookingRequestWithCodeInputSchema } from "@/domains/booking/booking.schema";
import {
  BOOKING_VERIFICATION_CODE_RESENT_MESSAGE,
  CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/booking/constants";
import type {
  ClientBookingInput,
  InlineBookingVerificationProps,
} from "@/domains/booking/types";
import { normalizeEmail } from "@/lib/email";

// The action schema's own code rule, so the "6 digits" copy has one source.
const CODE_SCHEMA = submitBookingRequestWithCodeInputSchema.shape.code;

interface UseBookingVerificationArgs {
  // The route's artist, passed straight to the submit actions.
  artistId: string;
  form: UseFormReturn<ClientBookingInput>;
  // Whether the page rendered for a CLIENT session -- BookingRequestWizard
  // (54.5.6.1) passes Boolean(initialClientDetails), so an ARTIST-view
  // session counts as a guest. Can change mid-flow: setting the session
  // cookie in a server action re-renders the page with this hook's state
  // kept, so a redeemed code flips it to true.
  isSignedInClient: boolean;
  // Called with the form's live errors when a send or submit finds the
  // draft invalid -- the wizard's goToFirstInvalidStep, so the client lands
  // on the step that owns the first error.
  onInvalidDraft: (errors: FieldErrors<ClientBookingInput>) => void;
}

// The Details & Verify step's submit (54.5.5.2): the inline email code for a
// guest, a plain submit for a CLIENT session. Drives InlineBookingVerification
// (54.5.4.3) through `verification`; the wizard's step state stays in
// useBookingRequestWizard. Every send and submit re-validates the whole
// draft, since any field may have changed after the code went out, and
// passes the resolver's parsed values to the action.
export function useBookingVerification({
  artistId,
  form,
  isSignedInClient,
  onInvalidDraft,
}: UseBookingVerificationArgs) {
  const cooldown = useResendCooldown();
  // The normalised address the current code went to; null = request step.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [resendMessage, setResendMessage] = useState<string | undefined>(undefined);
  // A code was redeemed but the booking write failed (54.5.3.4): the session
  // cookie is already set, so the retry takes the signed-in path even before
  // the re-rendered props arrive.
  const [hasRedeemedCode, setHasRedeemedCode] = useState(false);
  const [prevIsSignedInClient, setPrevIsSignedInClient] = useState(isSignedInClient);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRequestingCode, startRequest] = useTransition();
  const [isResending, startResend] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();
  const liveEmail = useWatch({ control: form.control, name: "email" });

  function resetCodeFlow() {
    setSentTo(null);
    setCode("");
    setError(undefined);
    setResendMessage(undefined);
  }

  // The session props changed. The server's view replaces hasRedeemedCode,
  // and only a real change of path resets: after a redeemed code this hook
  // is already signed in, so the props catching up keeps its "submit again"
  // error. isSubmitted is never touched -- a success sets the cookie too.
  if (isSignedInClient !== prevIsSignedInClient) {
    setPrevIsSignedInClient(isSignedInClient);
    setHasRedeemedCode(false);
    if ((prevIsSignedInClient || hasRedeemedCode) !== isSignedInClient) {
      resetCodeFlow();
    }
  }

  // A code only proves the address it went to: once the email field no
  // longer normalises to it, back to the request step with nothing from the
  // old code left over. Stops itself, since the reset clears sentTo.
  if (sentTo !== null && normalizeEmail(liveEmail) !== sentTo) {
    resetCodeFlow();
  }

  const isSignedIn = isSignedInClient || hasRedeemedCode;

  // Runs the full draft through the form's resolver. handleSubmit hands
  // onInvalid the live errors -- form.formState.errors can be a render
  // behind straight after an await -- and switches react-hook-form to
  // re-validating on change, so a fixed field's error clears as it's edited.
  function withValidDraft(onValid: (draft: ClientBookingInput) => Promise<void>) {
    return form.handleSubmit(onValid, (errors) => onInvalidDraft(errors))();
  }

  function onCodeChange(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, EMAIL_OTP_CODE_LENGTH));
  }

  // Server prevalidation (schema + validateComplexity), then the code. Every
  // success reads the same -- a cooldown, the daily cap or a failed send
  // included (54.5.2.1) -- and starts the cosmetic resend countdown;
  // issueEmailOtp's cooldown is the real gate.
  function onRequestCode() {
    if (isSignedIn || isRequestingCode) return;

    setError(undefined);
    startRequest(async () => {
      await withValidDraft(async (draft) => {
        // The code goes to the address sent here. If the field is edited
        // while this is in flight, the reset above returns the client to
        // the request step once it lands.
        const requestedEmail = normalizeEmail(draft.email);
        try {
          const result = await requestBookingVerificationCodeAction(draft);
          if (!result.success) {
            setError(result.error);
            return;
          }
          setSentTo(requestedEmail);
          setCode("");
          setResendMessage(undefined);
          cooldown.start();
        } catch {
          setError(REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE);
        }
      });
    });
  }

  function onResend() {
    if (sentTo === null || cooldown.isCoolingDown || isResending) return;

    setResendMessage(undefined);
    startResend(async () => {
      await withValidDraft(async (draft) => {
        try {
          const result = await requestBookingVerificationCodeAction(draft);
          if (!result.success) {
            setResendMessage(result.error);
            return;
          }
          // A reissue replaces the old code, so its typed digits and error
          // no longer apply.
          setCode("");
          setError(undefined);
          setResendMessage(BOOKING_VERIFICATION_CODE_RESENT_MESSAGE);
          cooldown.start();
        } catch {
          setResendMessage(REQUEST_BOOKING_SUBMISSION_CODE_UNEXPECTED_ERROR_MESSAGE);
        }
      });
    });
  }

  function onVerifyAndSubmit() {
    if (sentTo === null || isSubmitting) return;

    const parsedCode = CODE_SCHEMA.safeParse(code);
    if (!parsedCode.success) {
      setError(parsedCode.error.issues[0]?.message ?? CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE);
      return;
    }

    setError(undefined);
    startSubmit(async () => {
      await withValidDraft(async (draft) => {
        try {
          const result = await submitBookingRequestWithCodeAction(artistId, {
            ...draft,
            code: parsedCode.data,
          });
          if (result.success) {
            setIsSubmitted(true);
            return;
          }
          if (result.signedIn) {
            // Redeemed, and the cookie is set, but the booking write
            // failed: the code is spent, so drop the code step now. The
            // error tells the client to submit again without a new code.
            setHasRedeemedCode(true);
            resetCodeFlow();
          }
          setError(result.error);
        } catch {
          setError(CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE);
        }
      });
    });
  }

  // A CLIENT session (or a just-redeemed code) needs no code: the booking
  // attaches to the session's own profile, and the action never trusts the
  // draft's handle or email (54.5.3.3).
  function onSubmit() {
    if (!isSignedIn || isSubmitting) return;

    setError(undefined);
    startSubmit(async () => {
      await withValidDraft(async (draft) => {
        try {
          const result = await submitBookingRequest(artistId, draft);
          if (!result.success) {
            setError(result.error);
            return;
          }
          setIsSubmitted(true);
        } catch {
          setError(CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE);
        }
      });
    });
  }

  const verification: InlineBookingVerificationProps = {
    step: sentTo === null ? "request" : "code",
    email: sentTo ?? "",
    onRequestCode,
    isRequestingCode,
    onVerifyAndSubmit,
    isSubmitting,
    code,
    onCodeChange,
    onResend,
    resendCooldownSeconds: cooldown.secondsRemaining,
    isResending,
    error,
    resendMessage,
  };

  return {
    requiresCode: !isSignedIn,
    verification,
    onSubmit,
    isSubmitting,
    error,
    isSubmitted,
  };
}
