"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { FormEvent } from "react";

import {
  resendVerificationCodeAction,
  verifyEmailCodeAction,
} from "@/domains/auth/actions";
import {
  EMAIL_VERIFICATION_RESEND_COOLDOWN_MS,
  RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE,
  VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";

export const VERIFICATION_CODE_LENGTH = 6;

const RESEND_COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;

// Deliberately generic -- never hints at whether the address has an account.
export const RESEND_SUCCESS_MESSAGE =
  "If this email has a booking with us, we've sent a new code.";
export const INCOMPLETE_VERIFICATION_ERROR_MESSAGE =
  "Enter the 6-digit code and your password.";

interface UseVerifyEmailCodeOptions {
  email: string;
}

// Wires VerifyEmailCodeForm (27.3.4.1) to the verify/resend actions
// (27.3.3.1). The countdown is cosmetic: the server-side resend cooldown
// (27.3.2.6) is the authoritative gate. It starts full because a code was
// just sent by the signup/login that routed here.
export function useVerifyEmailCode({ email }: UseVerifyEmailCodeOptions) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [resendMessage, setResendMessage] = useState<string | undefined>(undefined);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(RESEND_COOLDOWN_SECONDS);
  const [isPending, startVerify] = useTransition();
  const [isResending, startResend] = useTransition();

  const isCoolingDown = resendCooldownSeconds > 0;

  useEffect(() => {
    if (!isCoolingDown) return;
    const interval = setInterval(() => {
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isCoolingDown]);

  function onCodeChange(value: string) {
    setCode(value.replace(/\D/g, "").slice(0, VERIFICATION_CODE_LENGTH));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    if (code.length !== VERIFICATION_CODE_LENGTH || password.length === 0) {
      setError(INCOMPLETE_VERIFICATION_ERROR_MESSAGE);
      return;
    }

    setError(undefined);
    startVerify(async () => {
      try {
        const result = await verifyEmailCodeAction({ email, code, password });
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push("/client");
      } catch {
        setError(VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  function onResend() {
    if (isCoolingDown || isResending) return;

    setResendMessage(undefined);
    startResend(async () => {
      try {
        const result = await resendVerificationCodeAction({ email });
        if (!result.success) {
          setResendMessage(result.error);
          return;
        }
        setResendMessage(RESEND_SUCCESS_MESSAGE);
        setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
      } catch {
        setResendMessage(RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE);
      }
    });
  }

  return {
    code,
    onCodeChange,
    password,
    onPasswordChange: setPassword,
    onSubmit,
    onResend,
    resendCooldownSeconds,
    isPending,
    isResending,
    error,
    resendMessage,
  };
}
