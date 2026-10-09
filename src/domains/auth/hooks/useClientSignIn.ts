"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { SubmitEvent } from "react";

import {
  requestClientSignInCodeAction,
  verifyClientSignInCodeAction,
} from "@/domains/auth/actions";
import {
  requestClientSignInCodeInputSchema,
  verifyClientSignInCodeInputSchema,
} from "@/domains/auth/auth.schema";
import {
  CLIENT_DASHBOARD_PATH,
  CLIENT_SIGN_IN_CODE_RESENT_MESSAGE,
  CLIENT_SIGN_IN_REDIRECT_PREFIXES,
  EMAIL_OTP_CODE_LENGTH,
  REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE,
  SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";
import { useResendCooldown } from "@/domains/auth/hooks/useResendCooldown";
import type { ClientSignInFormProps, ClientSignInStep } from "@/domains/auth/types";
import { safeRedirectPath } from "@/lib/safeRedirectPath";

// Wires ClientSignInForm (54.3.4.2) to the request/verify actions
// (54.3.3.1); returns exactly its props, so a host renders
// <ClientSignInForm {...useClientSignIn()} />. The schemas double as the
// client-side checks, so their copy is the only error copy (the form is
// noValidate). Every request success looks the same -- the action's result
// can't say whether the address has an account -- so each one starts the
// cosmetic resend countdown; issueEmailOtp's cooldown is the real gate.
//
// redirectTo goes through safeRedirectPath and falls back to the
// dashboard, so a crafted link can't send a fresh session off-site or out
// of the client area.
export function useClientSignIn(): ClientSignInFormProps {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cooldown = useResendCooldown();
  const [step, setStep] = useState<ClientSignInStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [resendMessage, setResendMessage] = useState<string | undefined>(undefined);
  const [isRequestingCode, startRequest] = useTransition();
  const [isVerifying, startVerify] = useTransition();
  const [isResending, startResend] = useTransition();

  function onCodeChange(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, EMAIL_OTP_CODE_LENGTH));
  }

  function onRequestCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRequestingCode) return;

    const parsed = requestClientSignInCodeInputSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      return;
    }

    // The code goes to the address submitted here, so the code step keeps
    // it even if the field is edited while the request is in flight.
    const submittedEmail = parsed.data.email;
    setError(undefined);
    startRequest(async () => {
      try {
        const result = await requestClientSignInCodeAction({ email: submittedEmail });
        if (!result.success) {
          setError(result.error);
          return;
        }
        setEmail(submittedEmail);
        setCode("");
        setResendMessage(undefined);
        setStep("code");
        cooldown.start();
      } catch {
        setError(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function onVerifyCode(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isVerifying) return;

    const parsed = verifyClientSignInCodeInputSchema.safeParse({ email, code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE);
      return;
    }

    setError(undefined);
    startVerify(async () => {
      try {
        const result = await verifyClientSignInCodeAction(parsed.data);
        if (!result.success) {
          setError(result.error);
          return;
        }
        const destination = safeRedirectPath(searchParams.get("redirectTo"), {
          allowedPrefixes: CLIENT_SIGN_IN_REDIRECT_PREFIXES,
          fallback: CLIENT_DASHBOARD_PATH,
        });
        // A fresh transition after the await keeps isVerifying true until
        // the navigation lands, so "Sign in" can't be re-sent against the
        // code this request just consumed.
        startVerify(() => {
          router.push(destination);
        });
      } catch {
        setError(SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function onResend() {
    if (cooldown.isCoolingDown || isResending) return;

    setResendMessage(undefined);
    startResend(async () => {
      try {
        const result = await requestClientSignInCodeAction({ email });
        if (!result.success) {
          setResendMessage(result.error);
          return;
        }
        // A reissue replaces the old code, so its typed digits and error
        // no longer apply.
        setCode("");
        setError(undefined);
        setResendMessage(CLIENT_SIGN_IN_CODE_RESENT_MESSAGE);
        cooldown.start();
      } catch {
        setResendMessage(REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  // Ignored while a verify or resend is in flight, so its late result can
  // never land on the email step.
  function onChangeEmail() {
    if (isVerifying || isResending) return;

    setStep("email");
    setCode("");
    setError(undefined);
    setResendMessage(undefined);
  }

  return {
    step,
    email,
    onEmailChange: setEmail,
    onRequestCode,
    isRequestingCode,
    onChangeEmail,
    onVerifyCode,
    isVerifying,
    code,
    onCodeChange,
    onResend,
    resendCooldownSeconds: cooldown.secondsRemaining,
    isResending,
    error,
    resendMessage,
  };
}
