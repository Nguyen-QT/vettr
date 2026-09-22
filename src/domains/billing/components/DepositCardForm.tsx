"use client";

import { PaymentElement } from "@stripe/react-stripe-js";

import { Button } from "@/components/ui/button";
import { useConfirmDepositPayment } from "@/domains/billing/hooks/useConfirmDepositPayment";

interface DepositCardFormProps {
  returnUrl: string;
}

// Pure view (CLAUDE.md 7.1.9): must be rendered inside
// <StripeElementsProvider> -- useConfirmDepositPayment's
// useStripe()/useElements() depend on that context. depositPaid itself
// flips via the Stripe webhook (async, not this request/response), so
// "succeeded" here only means Stripe confirmed the card -- the booking
// card above may take a moment to catch up.
export function DepositCardForm({ returnUrl }: DepositCardFormProps) {
  const { confirmPayment, isConfirming, error, succeeded, isReady } =
    useConfirmDepositPayment();

  if (succeeded) {
    return (
      <p className="text-sm font-medium">
        Payment successful. This may take a moment to update here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PaymentElement />
      <Button
        type="button"
        disabled={!isReady || isConfirming}
        onClick={() => confirmPayment(returnUrl)}
      >
        {isConfirming ? "Confirming…" : "Confirm payment"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
