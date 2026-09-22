"use client";

import { useState } from "react";

import { StripeElementsProvider } from "@/components/StripeElementsProvider";
import { Button } from "@/components/ui/button";
import { DepositCardForm } from "@/domains/billing/components/DepositCardForm";
import { useDepositPayment } from "@/domains/billing/hooks/useDepositPayment";

interface DepositPaymentCardProps {
  bookingRequestId: string;
  depositAmount: number;
}

// Pure view (CLAUDE.md 7.1.9): shown on the client dashboard for an
// APPROVED, unpaid request whose tier has a configured deposit (see
// getPayableDeposits). Starts idle -- "Pay deposit" fetches the
// PaymentIntent's clientSecret (useDepositPayment) before mounting
// <StripeElementsProvider>, since useStripe()/useElements() only work
// inside that tree.
export function DepositPaymentCard({
  bookingRequestId,
  depositAmount,
}: DepositPaymentCardProps) {
  const { clientSecret, isLoading, error, startDepositPayment } =
    useDepositPayment();
  const [started, setStarted] = useState(false);

  const returnUrl =
    typeof window !== "undefined" ? `${window.location.origin}/client` : "";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">Deposit required: £{depositAmount}</p>

      {!started ? (
        <Button
          type="button"
          size="sm"
          disabled={isLoading}
          onClick={() => {
            setStarted(true);
            startDepositPayment(bookingRequestId);
          }}
        >
          {isLoading ? "Loading…" : "Pay deposit"}
        </Button>
      ) : clientSecret ? (
        <StripeElementsProvider clientSecret={clientSecret}>
          <DepositCardForm returnUrl={returnUrl} />
        </StripeElementsProvider>
      ) : (
        <p className="text-sm text-muted-foreground">Loading payment form…</p>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
