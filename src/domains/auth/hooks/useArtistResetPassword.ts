"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { useForm, useWatch } from "react-hook-form";

import { resetArtistPasswordAction } from "@/domains/auth/actions";
import {
  artistPasswordResetFormSchema,
  resetArtistPasswordInputSchema,
} from "@/domains/auth/auth.schema";
import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";
import type {
  ArtistResetPasswordField,
  ArtistResetPasswordFormProps,
} from "@/domains/auth/types";

// Wires ArtistResetPasswordForm (71.1.4.2) to resetArtistPasswordAction
// (71.1.3.1); returns exactly its props, so a host renders
// <ArtistResetPasswordForm {...useArtistResetPassword(token)} />. The token
// stays in here -- the view never sees it. A missing or malformed token starts
// on the "invalid" step and sends nothing.
//
// The action returns a single error string, and every dead-link outcome (an
// unknown, expired, used or lost-race link, and a malformed token) carries
// INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE. Matching it is how a dead link
// is told apart from a retryable failure, without widening the action's
// contract.
//
// The in-flight ref is set synchronously, so two same-tick submits can't both
// reach the action; try/finally releases it on every non-success path, so a
// throw never leaves the form stuck (58.4). After a success it stays held
// while router.replace runs, so a second submit can't hit the consumed link
// and flash the invalid step.
export function useArtistResetPassword(token: string | undefined): ArtistResetPasswordFormProps {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(artistPasswordResetFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });
  const { errors } = form.formState;
  const { newPassword, confirmPassword } = useWatch({ control: form.control });

  const [linkInvalid, setLinkInvalid] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const inFlight = useRef(false);

  const tokenIsWellFormed = resetArtistPasswordInputSchema.shape.token.safeParse(token).success;

  async function submitValid(data: { newPassword: string }) {
    if (inFlight.current || token === undefined || !tokenIsWellFormed) return;

    inFlight.current = true;
    setIsSubmitting(true);
    setServerError(undefined);

    let redirecting = false;
    try {
      const result = await resetArtistPasswordAction({ token, newPassword: data.newPassword });

      if (result.success) {
        redirecting = true;
        setIsRedirecting(true);
        router.replace(`/artist/${result.artistId}`);
        return;
      }

      if (result.error === INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE) {
        setLinkInvalid(true);
        form.reset();
        return;
      }

      setServerError(result.error);
    } catch {
      redirecting = false;
      setIsRedirecting(false);
      setServerError(RESET_ARTIST_PASSWORD_UNEXPECTED_ERROR_MESSAGE);
    } finally {
      if (!redirecting) inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  // handleSubmit is called inside the handler, not during render, because
  // submitValid reads the in-flight ref.
  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    void form.handleSubmit(submitValid)(event);
  }

  // Validation runs on submit, not per keystroke; editing a field only drops
  // its stale error. The mismatch error lives on confirmPassword (a
  // cross-field refine), so editing the password drops it too.
  function onFieldChange(field: ArtistResetPasswordField, value: string) {
    form.setValue(field, value);
    form.clearErrors(field === "newPassword" ? ["newPassword", "confirmPassword"] : field);
    setServerError(undefined);
  }

  return {
    step: linkInvalid || !tokenIsWellFormed ? "invalid" : "form",
    newPassword: newPassword ?? "",
    confirmPassword: confirmPassword ?? "",
    onFieldChange,
    onSubmit,
    isPending: isSubmitting || isRedirecting,
    errors: {
      newPassword: errors.newPassword?.message,
      confirmPassword: errors.confirmPassword?.message,
    },
    serverError,
  };
}
