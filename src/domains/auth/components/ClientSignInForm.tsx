"use client";

import Link from "next/link";

import { ARTIST_LOGIN_PATH, EMAIL_VERIFICATION_CODE_EXPIRY_MS } from "../constants";
import { ClientSignInFormProps } from "../types";
import { OtpCodeInput } from "./OtpCodeInput";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const CODE_EXPIRY_MINUTES = EMAIL_VERIFICATION_CODE_EXPIRY_MS / (1000 * 60);

// Pure view (54.3.4.2): renders whatever step/email/code/error state it's
// given and makes no decisions of its own. Owns the <form> that
// OtpCodeInput deliberately leaves out; state, the resend countdown and the
// request/verify actions are wired in by useClientSignIn (54.3.5.2).
//
// The code-step copy is the same for every outcome -- the view has no
// eligibility input, so it can't reveal whether a client account exists.
// noValidate keeps the browser's type="email" bubble from blocking submit
// before the hook's schema check, so that check's message is the only
// error copy. No heading and no autoFocus: the host (/client/login, the
// portal gate) supplies the heading, and the gate has its own finder field.
export function ClientSignInForm({
  step,
  email,
  onEmailChange,
  onRequestCode,
  isRequestingCode = false,
  onChangeEmail,
  onVerifyCode,
  isVerifying = false,
  code,
  onCodeChange,
  onResend,
  resendCooldownSeconds,
  isResending = false,
  error,
  resendMessage,
}: ClientSignInFormProps) {
  if (step === "email") {
    return (
      <form noValidate onSubmit={onRequestCode}>
        <FieldGroup>
          <p className="text-sm text-muted-foreground">
            Enter the email you use for your bookings and we&apos;ll send you a
            6-digit sign-in code. No password needed.
          </p>

          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="clientSignInEmail">Email</FieldLabel>
            <Input
              id="clientSignInEmail"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              aria-invalid={!!error}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>

          <Button type="submit" disabled={isRequestingCode}>
            {isRequestingCode ? "Sending code…" : "Email me a code"}
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={onVerifyCode}>
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            If <span className="font-medium break-all text-foreground">{email}</span>{" "}
            has a client account with us, we&apos;ve sent it a 6-digit code. It
            expires in {CODE_EXPIRY_MINUTES} minutes.
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto w-fit p-0 text-sm"
            onClick={onChangeEmail}
            disabled={isVerifying}
          >
            Use a different email
          </Button>
        </div>

        <OtpCodeInput
          code={code}
          onCodeChange={onCodeChange}
          onResend={onResend}
          resendCooldownSeconds={resendCooldownSeconds}
          isResending={isResending}
          error={error}
          resendMessage={resendMessage}
        />

        <Button type="submit" disabled={isVerifying}>
          {isVerifying ? "Signing in…" : "Sign in"}
        </Button>

        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Didn&apos;t get a code?
          </summary>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>Check your spam or junk folder.</li>
            <li>
              Make sure it&apos;s the email you use for your bookings. You can use
              a different email above.
            </li>
            <li>
              Codes can take a minute to arrive. Once the timer runs out, you
              can request a new one.
            </li>
            <li>
              Artist accounts sign in with a password.{" "}
              <Link
                href={ARTIST_LOGIN_PATH}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Sign in as an artist
              </Link>
              , then switch to client view.
            </li>
          </ul>
        </details>
      </FieldGroup>
    </form>
  );
}
