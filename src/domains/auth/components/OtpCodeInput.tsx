"use client";

import { OtpCodeInputProps } from "../types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Pure view (54.3.4.1): renders whatever code/error/cooldown state it's
// given and makes no decisions of its own. Deliberately no <form> -- it's
// embedded in ClientSignInForm (54.3.4.2) and inside the booking wizard's
// own outer <form> (54.5.4.3), and HTML forbids a <form> descendant of
// another <form>; Enter in the input submits whichever form wraps it. The
// countdown is driven by useResendCooldown (54.3.5.1), sanitizing and the
// actions by useClientSignIn (54.3.5.2).
//
// No maxLength: it truncates a pasted " 123456" or "123 456" to six
// characters before the hook strips non-digits, losing a digit. The input
// is controlled, so the hook's sanitizer is what caps it at 6 digits.
export function OtpCodeInput({
  code,
  onCodeChange,
  onResend,
  resendCooldownSeconds,
  isResending = false,
  error,
  resendMessage,
}: OtpCodeInputProps) {
  const isCoolingDown = resendCooldownSeconds > 0;

  let resendLabel = "Resend code";
  if (isResending) {
    resendLabel = "Sending a new code…";
  } else if (isCoolingDown) {
    resendLabel = `Resend code in ${resendCooldownSeconds}s`;
  }

  return (
    <FieldGroup>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="emailOtpCode">6-digit code</FieldLabel>
        <Input
          id="emailOtpCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          aria-invalid={!!error}
          className="h-12 text-center text-lg tracking-widest tabular-nums md:text-lg"
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>

      <div className="flex flex-col gap-2">
        {/* type="button" -- a resend must never submit the parent form. */}
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit p-0 text-sm"
          onClick={onResend}
          disabled={isCoolingDown || isResending}
        >
          {resendLabel}
        </Button>

        {resendMessage ? (
          <p role="status" className="text-sm text-muted-foreground">
            {resendMessage}
          </p>
        ) : null}
      </div>
    </FieldGroup>
  );
}
