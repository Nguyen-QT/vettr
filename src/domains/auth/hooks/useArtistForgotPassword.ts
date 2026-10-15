"use client";

import { useState, useTransition } from "react";
import type { SubmitEvent } from "react";

import { requestArtistPasswordResetAction } from "@/domains/auth/actions";
import { requestArtistPasswordResetInputSchema } from "@/domains/auth/auth.schema";
import { REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE } from "@/domains/auth/constants";
import type {
  ArtistForgotPasswordFormProps,
  ArtistForgotPasswordStep,
} from "@/domains/auth/types";

// Wires ArtistForgotPasswordForm (71.1.4.1) to requestArtistPasswordResetAction
// (71.1.3.1); returns exactly its props, so a host renders
// <ArtistForgotPasswordForm {...useArtistForgotPassword()} />. The schema
// doubles as the client-side check, so its copy is the only validation copy
// (the form is noValidate).
//
// Every success moves to "sent" -- the action's result can't say whether the
// address has an artist account, so neither can this hook. There's no resend
// cooldown: the form has no resend control, and the server-side cooldown and
// live-link cap are silent successes.
export function useArtistForgotPassword(): ArtistForgotPasswordFormProps {
  const [step, setStep] = useState<ArtistForgotPasswordStep>("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startRequest] = useTransition();

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    const parsed = requestArtistPasswordResetInputSchema.safeParse({ email });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE
      );
      return;
    }

    // The "sent" step names the address submitted here, even if the field is
    // edited while the request is in flight.
    const submittedEmail = parsed.data.email;
    setError(undefined);
    startRequest(async () => {
      try {
        const result = await requestArtistPasswordResetAction({ email: submittedEmail });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setEmail(submittedEmail);
        setStep("sent");
      } catch {
        setError(REQUEST_ARTIST_PASSWORD_RESET_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  // Ignored while a request is in flight, so its late result can never land
  // on the email step.
  function onChangeEmail() {
    if (isPending) return;

    setStep("email");
    setError(undefined);
  }

  return {
    step,
    email,
    onEmailChange: setEmail,
    onSubmit,
    isPending,
    onChangeEmail,
    error,
  };
}
