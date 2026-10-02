"use client";

import { VerifyEmailCodeFormProps } from "../types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const CODE_LENGTH = 6;

// Pure view (CLAUDE.md 27.3.4.1/27.3.4.2): renders whatever code/password/error/cooldown
// state it's given via props and makes no decisions of its own. State,
// the resend timer and the server action calls are wired in by the
// useVerifyEmailCode hook (27.3.5.1).
export function VerifyEmailCodeForm({
  code,
  onCodeChange,
  password,
  onPasswordChange,
  onSubmit,
  onResend,
  resendCooldownSeconds,
  isPending = false,
  isResending = false,
  error,
  resendMessage,
}: VerifyEmailCodeFormProps) {
  const isCoolingDown = resendCooldownSeconds > 0;

  return (
    <form onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="verificationCode">Verification code</FieldLabel>
          <Input
            id="verificationCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            aria-invalid={!!error}
          />
        </Field>

        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="verificationPassword">Password</FieldLabel>
          <Input
            id="verificationPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            aria-invalid={!!error}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        {resendMessage ? (
          <p className="text-sm text-muted-foreground">{resendMessage}</p>
        ) : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Verifying..." : "Verify"}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onResend}
          disabled={isCoolingDown || isResending}
        >
          {isCoolingDown ? `Resend code in ${resendCooldownSeconds}s` : "Resend code"}
        </Button>
      </FieldGroup>
    </form>
  );
}
