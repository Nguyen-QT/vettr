"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelIntakeRequestAction,
  updatePendingIntakeRequestAction,
} from "@/domains/intake/actions";
import type { ClientBudgetRange } from "@/domains/intake/types";
import type { SlotTime } from "@/domains/scheduling/types";

export interface UpdatePendingBookingFields {
  clientNotes?: string;
  clientBudgetRange: ClientBudgetRange;
  requestedDate: string;
  requestedTime: SlotTime;
}

// Data orchestration (CLAUDE.md 5.4.3): wraps cancelIntakeRequestAction/
// updatePendingIntakeRequestAction with pending/editing/error state for
// the client dashboard. Unlike useRequestActions (the artist-side
// equivalent), this DOES call router.refresh() on success -- there's no
// inline response message worth preserving here, just the booking's
// new status/details, so the simplest way to reflect that is
// re-fetching the server-rendered list.
export function useClientBookingActions(intakeRequestId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelIntakeRequestAction(intakeRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function startEditing() {
    setError(null);
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  function saveEdit(fields: UpdatePendingBookingFields) {
    setError(null);
    startTransition(async () => {
      const result = await updatePendingIntakeRequestAction(
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
    cancel,
    isEditing,
    startEditing,
    cancelEditing,
    saveEdit,
    isPending,
    error,
  };
}
