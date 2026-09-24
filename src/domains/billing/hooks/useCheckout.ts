"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addBillingAddonAction,
  finalizeCheckoutAction,
  removeBillingAddonAction,
} from "@/domains/billing/actions";
import { updateBookingPaymentMethodAction } from "@/domains/booking/actions";
import type { PaymentMethod } from "@/domains/booking/types";

interface UseCheckoutArgs {
  bookingRequestId: string;
  artistId: string;
}

// Data orchestration (CLAUDE.md 7.5.6): wraps the day-of checkout
// flow's three mutations with pending/error state for the checkout
// page (7.5.7). addAddon/removeAddon call router.refresh() on success
// -- there's no inline response worth preserving, just the
// server-composed addon list/final bill (7.5.5's page-composed reads)
// reflecting the change -- same posture as useClientBookingActions
// (5.4.3)/useAppointmentLifecycleActions (5.6.4). finalize navigates
// back to the appointments list instead, since the booking leaves
// past-due state entirely once COMPLETED.
//
// Each of the three actions gets its own isPending/error pair (CLAUDE.md
// "Independent Mutation State Isolation") rather than one shared pair --
// otherwise an older action's result can clobber a newer one's error
// after both resolve out of order, and the view has no correct way to
// disable only the right control. removingAddonId additionally tracks
// *which* addon a remove is in flight for, since removeAddon is a
// per-item action, not a single toggle like addAddon/finalize.
export function useCheckout({ bookingRequestId, artistId }: UseCheckoutArgs) {
  const router = useRouter();

  const [isAdding, startAddTransition] = useTransition();
  const [addError, setAddError] = useState<string | null>(null);

  const [, startRemoveTransition] = useTransition();
  const [removingAddonId, setRemovingAddonId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [isFinalizing, startFinalizeTransition] = useTransition();
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const [isOverridingPaymentMethod, startOverridePaymentMethodTransition] =
    useTransition();
  const [overridePaymentMethodError, setOverridePaymentMethodError] = useState<
    string | null
  >(null);

  function addAddon(input: { label: string; price: number }) {
    setAddError(null);
    startAddTransition(async () => {
      const result = await addBillingAddonAction(bookingRequestId, input);
      if (!result.success) {
        setAddError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function removeAddon(addonId: string) {
    setRemoveError(null);
    setRemovingAddonId(addonId);
    startRemoveTransition(async () => {
      const result = await removeBillingAddonAction(addonId);
      setRemovingAddonId(null);
      if (!result.success) {
        setRemoveError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function finalize() {
    setFinalizeError(null);
    startFinalizeTransition(async () => {
      const result = await finalizeCheckoutAction(bookingRequestId);
      if (!result.success) {
        setFinalizeError(result.error);
        return;
      }
      router.push(`/artist/${artistId}/appointments`);
    });
  }

  function overridePaymentMethod(paymentMethod: PaymentMethod) {
    setOverridePaymentMethodError(null);
    startOverridePaymentMethodTransition(async () => {
      const result = await updateBookingPaymentMethodAction(
        bookingRequestId,
        paymentMethod
      );
      if (!result.success) {
        setOverridePaymentMethodError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return {
    addAddon,
    isAdding,
    addError,
    removeAddon,
    removingAddonId,
    removeError,
    finalize,
    isFinalizing,
    finalizeError,
    overridePaymentMethod,
    isOverridingPaymentMethod,
    overridePaymentMethodError,
  };
}
