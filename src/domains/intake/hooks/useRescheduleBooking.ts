"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { rescheduleApprovedBookingAction } from "@/domains/intake/actions";
import type { SlotTime } from "@/domains/scheduling/types";

export interface RescheduleBookingFields {
  requestedDate: string;
  requestedTime: SlotTime;
  durationMinutes: number;
}

// Data orchestration (CLAUDE.md 5.5.3): wraps rescheduleApprovedBookingAction
// with editing/pending/error state for the artist's upcoming-appointments
// view, same shape as useClientBookingActions (5.4.3) -- calls
// router.refresh() on success since the booking's new time is the only
// thing that needs to show, no inline message worth preserving.
export function useRescheduleBooking(intakeRequestId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  function saveReschedule(fields: RescheduleBookingFields) {
    setError(null);
    startTransition(async () => {
      const result = await rescheduleApprovedBookingAction(
        intakeRequestId,
        fields
      );
      if (!result.success) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      router.refresh();
    });
  }

  return {
    isEditing,
    startEditing,
    cancelEditing,
    saveReschedule,
    isPending,
    error,
  };
}
