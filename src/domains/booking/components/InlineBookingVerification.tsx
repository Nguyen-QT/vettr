"use client";

import { Button } from "@/components/ui/button";
import {
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { OtpCodeInput } from "@/domains/auth/components/OtpCodeInput";
import { EMAIL_VERIFICATION_CODE_EXPIRY_MS } from "@/domains/auth/constants";
import type { InlineBookingVerificationProps } from "@/domains/booking/types";

const CODE_EXPIRY_MINUTES = EMAIL_VERIFICATION_CODE_EXPIRY_MS / (1000 * 60);

// Pure view (54.5.4.3): the Details & Verify step's inline email code, shown
// under BookingDetailsFields to a visitor without a CLIENT session (a
// signed-in client skips it). Renders whatever step/email/code/error state
// it's given and makes no decisions of its own -- useBookingVerification
// (54.5.5.2) drives it, BookingRequestWizard (54.5.6.1) mounts it.
//
// Deliberately no <form> and every button type="button": it sits inside the
// wizard's own outer <form>, HTML forbids a nested one, and a native submit
// the wizard doesn't handle would reload the page. Enter handling is the
// wizard's call. The copy is the same for every address -- a booking code is
// always sent once the draft passes server checks, and the post-proof
// outcomes (e.g. an artist's email) only ever arrive as `error` after a
// valid code. No heading and no autoFocus: the wizard step supplies both.
export function InlineBookingVerification({
  step,
  email,
  onRequestCode,
  isRequestingCode = false,
  onVerifyAndSubmit,
  isSubmitting = false,
  code,
  onCodeChange,
  onResend,
  resendCooldownSeconds,
  isResending = false,
  error,
  resendMessage,
}: InlineBookingVerificationProps) {
  if (step === "request") {
    return (
      <FieldSet>
        <FieldLegend>Verify your email</FieldLegend>
        <FieldDescription>
          We&apos;ll email you a 6-digit code to confirm it&apos;s you. Your
          request goes to the artist once you enter it.
        </FieldDescription>

        {error ? <FieldError>{error}</FieldError> : null}

        <Button
          type="button"
          onClick={onRequestCode}
          disabled={isRequestingCode}
        >
          {isRequestingCode ? "Sending code…" : "Email me a code"}
        </Button>
      </FieldSet>
    );
  }

  return (
    <FieldSet>
      <FieldLegend>Verify your email</FieldLegend>
      <FieldDescription>
        We&apos;ve sent a 6-digit code to{" "}
        <span className="font-medium break-all text-foreground">{email}</span>.
        It expires in {CODE_EXPIRY_MINUTES} minutes. If you change your email
        above, you&apos;ll need a new code.
      </FieldDescription>

      <OtpCodeInput
        code={code}
        onCodeChange={onCodeChange}
        onResend={onResend}
        resendCooldownSeconds={resendCooldownSeconds}
        isResending={isResending}
        error={error}
        resendMessage={resendMessage}
      />

      <Button
        type="button"
        onClick={onVerifyAndSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? "Submitting…" : "Verify and submit request"}
      </Button>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Didn&apos;t get a code?
        </summary>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>Check your spam or junk folder.</li>
          <li>
            Make sure the email above is right. If you change it, you&apos;ll
            need a new code.
          </li>
          <li>
            Codes can take a minute to arrive. Once the timer runs out, you can
            request a new one.
          </li>
        </ul>
      </details>
    </FieldSet>
  );
}
