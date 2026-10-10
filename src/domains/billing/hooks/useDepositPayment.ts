"use client";

import { useState } from "react";

import { createDepositPaymentIntentAction } from "@/domains/billing/actions";
import { DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE } from "@/domains/billing/constants";

// Data orchestration (CLAUDE.md 7.1.7): fetches the PaymentIntent's
// clientSecret for an APPROVED, unpaid request so the caller can mount
// <StripeElementsProvider clientSecret={...}> around the actual card
// form. Deliberately separate from useConfirmDepositPayment --
// useStripe()/useElements() only work inside an Elements tree, which
// doesn't exist yet at the point this clientSecret is being fetched.
// A rejected action call (network, a deploy mid-session) gets the
// action's generic retryable error, and isLoading always resets (56.5).
export function useDepositPayment() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startDepositPayment(bookingRequestId: string) {
    setIsLoading(true);
    setError(null);

    try {
      const result = await createDepositPaymentIntentAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setClientSecret(result.clientSecret);
    } catch {
      setError(DEPOSIT_PAYMENT_INIT_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }

  return { clientSecret, isLoading, error, startDepositPayment };
}
