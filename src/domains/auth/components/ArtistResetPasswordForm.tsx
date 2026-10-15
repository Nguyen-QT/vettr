"use client";

import Link from "next/link";

import {
  ARTIST_FORGOT_PASSWORD_PATH,
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  MIN_ARTIST_PASSWORD_LENGTH,
} from "../constants";
import { ArtistResetPasswordFormProps } from "../types";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Pure view (71.1.4.2): renders whatever step/values/error state it's given
// and makes no decisions of its own; state and the reset action are wired in
// by useArtistResetPassword (71.1.5.2).
//
// The "invalid" copy is the generic link message, so a dead link never says
// why it failed. The view has no token prop, so the token can't reach the DOM.
// noValidate keeps the browser from blocking submit before the hook's schema
// check, so that check's messages are the only error copy. No heading and no
// autoFocus: the host page supplies the heading.
export function ArtistResetPasswordForm({
  step,
  newPassword,
  confirmPassword,
  onFieldChange,
  onSubmit,
  isPending = false,
  errors,
  serverError,
}: ArtistResetPasswordFormProps) {
  if (step === "invalid") {
    return (
      <FieldGroup>
        <p role="alert" className="text-sm text-muted-foreground">
          {INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE}
        </p>
        <Link
          href={ARTIST_FORGOT_PASSWORD_PATH}
          className={buttonVariants({ className: "w-full" })}
        >
          Request a new link
        </Link>
      </FieldGroup>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      <FieldGroup>
        <Field data-invalid={!!errors?.newPassword}>
          <FieldLabel htmlFor="artistResetPasswordNew">New password</FieldLabel>
          <Input
            id="artistResetPasswordNew"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={newPassword}
            onChange={(e) => onFieldChange("newPassword", e.target.value)}
            aria-invalid={!!errors?.newPassword}
            aria-describedby="artistResetPasswordHint"
          />
          <FieldDescription id="artistResetPasswordHint">
            At least {MIN_ARTIST_PASSWORD_LENGTH} characters.
          </FieldDescription>
          {errors?.newPassword ? <FieldError>{errors.newPassword}</FieldError> : null}
        </Field>

        <Field data-invalid={!!errors?.confirmPassword}>
          <FieldLabel htmlFor="artistResetPasswordConfirm">Confirm new password</FieldLabel>
          <Input
            id="artistResetPasswordConfirm"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={confirmPassword}
            onChange={(e) => onFieldChange("confirmPassword", e.target.value)}
            aria-invalid={!!errors?.confirmPassword}
          />
          {errors?.confirmPassword ? <FieldError>{errors.confirmPassword}</FieldError> : null}
        </Field>

        {serverError ? <FieldError>{serverError}</FieldError> : null}

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Set new password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
