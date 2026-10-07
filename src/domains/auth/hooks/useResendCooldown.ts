"use client";

import { useCallback, useEffect, useState } from "react";

import { EMAIL_VERIFICATION_RESEND_COOLDOWN_MS } from "@/domains/auth/constants";

const RESEND_COOLDOWN_SECONDS = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS / 1000;
const TICK_MS = 1000;

// Rounded up so the countdown never reads 0 while the cooldown still has
// time left; floored at 0 so a late tick never shows a negative count.
function secondsUntil(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
}

// The resend countdown behind OtpCodeInput (54.3.4.1), shared by
// useClientSignIn (54.3.5.2) and useBookingVerification (54.5.5.2). The
// countdown is cosmetic: issueEmailOtp's cooldown (54.3.2.4) is the
// authoritative gate. Idle until start(), which the caller invokes only once
// a code request resolves -- after the server has set sentAt -- so this
// countdown always ends after the server's. Callers start it on every
// generic "code sent" result, so it looks the same whether or not the
// address has an account.
//
// Counts down to a deadline on the monotonic clock rather than decrementing
// per tick: the user leaves the tab to fetch the code, and a background tab
// throttles or suspends intervals, so a tick counter would fall behind; a
// system clock change mustn't freeze the button or end the wait early.
export function useResendCooldown() {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (deadline === null) return;
    const interval = setInterval(() => {
      const seconds = secondsUntil(deadline);
      setSecondsRemaining(seconds);
      if (seconds === 0) setDeadline(null);
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [deadline]);

  // Restarts from the full cooldown if one is already running.
  const start = useCallback(() => {
    setDeadline(performance.now() + EMAIL_VERIFICATION_RESEND_COOLDOWN_MS);
    setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
  }, []);

  return {
    secondsRemaining,
    isCoolingDown: secondsRemaining > 0,
    start,
  };
}
