"use client";

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
// getPayableDeposits). "Pay deposit" fetches the PaymentIntent's
// clientSecret (useDepositPayment) before mounting
// <StripeElementsProvider>, since useStripe()/useElements() only work
// inside that tree. Renders from the hook's state alone: until there's
// a clientSecret it shows "Pay deposit", so every error leaves a retry
// button (56.5).
export function DepositPaymentCard({
  bookingRequestId,
  depositAmount,
}: DepositPaymentCardProps) {
  const { clientSecret, isLoading, error, startDepositPayment } =
    useDepositPayment();

  const returnUrl =
    typeof window !== "undefined" ? `${window.location.origin}/client` : "";

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium">Deposit required: £{depositAmount}</p>

      {clientSecret ? (
        <StripeElementsProvider clientSecret={clientSecret}>
          <DepositCardForm returnUrl={returnUrl} />
        </StripeElementsProvider>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={isLoading}
          onClick={() => startDepositPayment(bookingRequestId)}
        >
          {isLoading ? "Loading…" : "Pay deposit"}
        </Button>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
