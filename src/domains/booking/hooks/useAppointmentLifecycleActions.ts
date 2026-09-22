"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelApprovedBookingAsArtistAction,
  markAppointmentCompletedAction,
  markAppointmentNoShowAction,
} from "@/domains/booking/actions";

// Data orchestration (CLAUDE.md 5.6.4): wraps the three artist-side
// lifecycle actions (cancel/no-show/complete) for a past-due appointment
// on the "Needs Resolution" section, same shape as useClientBookingActions
// (5.4.3) -- calls router.refresh() on success since there's no inline
// message worth preserving, just the request moving out of the past-due
// list once resolved.
export function useAppointmentLifecycleActions(bookingRequestId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelApprovedBookingAsArtistAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function markNoShow() {
    setError(null);
    startTransition(async () => {
      const result = await markAppointmentNoShowAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function markCompleted() {
    setError(null);
    startTransition(async () => {
      const result = await markAppointmentCompletedAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return { cancel, markNoShow, markCompleted, isPending, error };
}
