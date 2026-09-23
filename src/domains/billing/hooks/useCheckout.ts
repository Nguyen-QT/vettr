"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addBillingAddonAction,
  finalizeCheckoutAction,
  removeBillingAddonAction,
} from "@/domains/billing/actions";

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
export function useCheckout({ bookingRequestId, artistId }: UseCheckoutArgs) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function addAddon(input: { label: string; price: number }) {
    setError(null);
    startTransition(async () => {
      const result = await addBillingAddonAction(bookingRequestId, input);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function removeAddon(addonId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeBillingAddonAction(addonId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function finalize() {
    setError(null);
    startTransition(async () => {
      const result = await finalizeCheckoutAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/artist/${artistId}/appointments`);
    });
  }

  return { addAddon, removeAddon, finalize, isPending, error };
}
