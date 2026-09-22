"use client";

import { useState } from "react";

import { createDepositPaymentIntentAction } from "@/domains/billing/actions";

// Data orchestration (CLAUDE.md 7.1.7): fetches the PaymentIntent's
// clientSecret for an APPROVED, unpaid request so the caller can mount
// <StripeElementsProvider clientSecret={...}> around the actual card
// form. Deliberately separate from useConfirmDepositPayment --
// useStripe()/useElements() only work inside an Elements tree, which
// doesn't exist yet at the point this clientSecret is being fetched.
export function useDepositPayment() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDepositPayment(intakeRequestId: string) {
    setIsLoading(true);
    setError(null);

    const result = await createDepositPaymentIntentAction(intakeRequestId);
    setIsLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setClientSecret(result.clientSecret);
  }

  return { clientSecret, isLoading, error, startDepositPayment };
}
