"use client";

import { PASSWORD_RESET_TOKEN_EXPIRY_MS } from "../constants";
import { ArtistForgotPasswordFormProps } from "../types";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EXPIRY_HOURS = PASSWORD_RESET_TOKEN_EXPIRY_MS / (1000 * 60 * 60);
const EXPIRY_LABEL = `${EXPIRY_HOURS} ${EXPIRY_HOURS === 1 ? "hour" : "hours"}`;

// Pure view (71.1.4.1): renders whatever step/email/error state it's given
// and makes no decisions of its own; state and the request action are wired
// in by useArtistForgotPassword (71.1.5.1).
//
// The "sent" copy is the same for every outcome -- the view has no
// eligibility input, so it can't reveal whether an artist account exists.
// noValidate keeps the browser's type="email" bubble from blocking submit
// before the hook's schema check, so that check's message is the only error
// copy. No heading and no autoFocus: the host page supplies the heading.
export function ArtistForgotPasswordForm({
  step,
  email,
  onEmailChange,
  onSubmit,
  isPending = false,
  onChangeEmail,
  error,
}: ArtistForgotPasswordFormProps) {
  if (step === "email") {
    return (
      <form noValidate onSubmit={onSubmit}>
        <FieldGroup>
          <p className="text-sm text-muted-foreground">
            Enter the email on your artist account and we&apos;ll send you a
            link to reset your password.
          </p>

          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="artistForgotPasswordEmail">Email</FieldLabel>
            <Input
              id="artistForgotPasswordEmail"
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

          <Button type="submit" disabled={isPending}>
            {isPending ? "Sending link…" : "Send reset link"}
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        <p role="status" className="text-sm text-muted-foreground">
          If <span className="font-medium break-all text-foreground">{email}</span>{" "}
          belongs to an artist account, we&apos;ve sent it a reset link. It
          expires in {EXPIRY_LABEL}; use the newest one.
        </p>
        <Button
          type="button"
          variant="link"
          className="h-auto w-fit p-0 text-sm"
          onClick={onChangeEmail}
        >
          Use a different email
        </Button>
      </div>
    </FieldGroup>
  );
}
