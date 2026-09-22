"use client";

import { useElements, useStripe } from "@stripe/react-stripe-js";
import { useState } from "react";

// Data orchestration (CLAUDE.md 7.1.7): must be rendered inside a
// <StripeElementsProvider> tree -- useStripe()/useElements() return
// null outside one, hence isReady below. redirect: "if_required" keeps
// card payments fully in-app rather than forcing a redirect round-trip;
// returnUrl is only actually used if a payment method needs an
// authentication redirect (e.g. 3D Secure), which is realistic given
// the UK/EU card base this deposit flow targets.
export function useConfirmDepositPayment() {
  const stripe = useStripe();
  const elements = useElements();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  async function confirmPayment(returnUrl: string) {
    if (!stripe || !elements) {
      return;
    }

    setIsConfirming(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });

    setIsConfirming(false);

    if (result.error) {
      setError(result.error.message ?? "Your card could not be confirmed.");
      return;
    }

    setSucceeded(true);
  }

  return {
    confirmPayment,
    isConfirming,
    error,
    succeeded,
    isReady: Boolean(stripe && elements),
  };
}
