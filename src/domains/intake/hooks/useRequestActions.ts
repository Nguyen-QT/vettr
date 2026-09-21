"use client";

import { useState, useTransition } from "react";

import {
  confirmProposedBookingAction,
  declineIntakeRequest,
  reviewIntakeRequestAction,
} from "@/domains/intake/actions";

// Data orchestration (CLAUDE.md): wraps the review/confirm/decline Server
// Actions with pending/result/error state. Deliberately does NOT call
// router.refresh() on success: the dashboard's actionable-only query
// (3.2c, broadened 4.1i) would immediately drop this card from the DOM,
// taking the response message with it before the artist can read or copy
// it. The card is left to fall out of the list naturally on the artist's
// next visit instead -- including the PENDING -> AWAITING_SLOT_CONFIRMATION
// transition, which the artist will see as a "Confirm Booking" card then.
export function useRequestActions(intakeRequestId: string) {
  const [isPending, startTransition] = useTransition();
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function review(durationMinutes: number, estimatedPrice: number) {
    setError(null);
    startTransition(async () => {
      const result = await reviewIntakeRequestAction(intakeRequestId, {
        durationMinutes,
        estimatedPrice,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResponseMessage(result.responseMessage);
    });
  }

  function confirmBooking() {
    setError(null);
    startTransition(async () => {
      const result = await confirmProposedBookingAction(intakeRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResponseMessage(result.responseMessage);
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await declineIntakeRequest(intakeRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setResponseMessage(result.responseMessage);
    });
  }

  return { review, confirmBooking, decline, isPending, responseMessage, error };
}
