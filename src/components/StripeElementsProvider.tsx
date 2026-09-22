"use client";

import { Elements } from "@stripe/react-stripe-js";
import type { ReactNode } from "react";

import { getStripe } from "@/lib/stripe-client";

interface StripeElementsProviderProps {
  clientSecret: string;
  children: ReactNode;
}

// UI Primitive (CLAUDE.md 7.1.6): zero business logic -- just wires the
// browser Stripe.js instance and a PaymentIntent's clientSecret into
// Elements' React context. The deposit card form and its
// confirm/loading/error state are 7.1.7's useDepositPayment, not here.
export function StripeElementsProvider({
  clientSecret,
  children,
}: StripeElementsProviderProps) {
  return (
    <Elements stripe={getStripe()} options={{ clientSecret }}>
      {children}
    </Elements>
  );
}
