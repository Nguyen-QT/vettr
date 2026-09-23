"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cancelBookingRequestAction,
  updatePendingBookingRequestAction,
} from "@/domains/booking/actions";
import type { ClientBudgetRange } from "@/domains/booking/types";
import type { SlotTime } from "@/domains/scheduling/types";

export interface UpdatePendingBookingFields {
  clientNotes?: string;
  clientBudgetRange: ClientBudgetRange;
  requestedDate: string;
  requestedTime: SlotTime;
}

// Data orchestration (CLAUDE.md 5.4.3): wraps cancelBookingRequestAction/
// updatePendingBookingRequestAction with pending/editing/error state for
// the client dashboard. Unlike useRequestActions (the artist-side
// equivalent), this DOES call router.refresh() on success -- there's no
// inline response message worth preserving here, just the booking's
// new status/details, so the simplest way to reflect that is
// re-fetching the server-rendered list.
export function useClientBookingActions(bookingRequestId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lifts 5.4's original images exclusion (CLAUDE.md 13.2.4) -- unlike
  // notes/budget/date, which stay local useState in ClientBookingActions
  // itself, the image list needs an append/remove pair to mirror
  // useVisualBookingForm's (13.1.2) pattern, so it lives here instead.
  const [designReferenceImageUrls, setDesignReferenceImageUrls] = useState<
    string[]
  >([]);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingRequestAction(bookingRequestId);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // Seeds the editable image list from the booking's current images --
  // defaults to [] only for callers that haven't been updated yet to
  // pass it (CLAUDE.md 13.2.5 wires the real value in).
  function startEditing(initialDesignReferenceImageUrls: string[] = []) {
    setError(null);
    setDesignReferenceImageUrls(initialDesignReferenceImageUrls);
    setIsEditing(true);
  }

  function cancelEditing() {
    setError(null);
    setIsEditing(false);
  }

  function addDesignReferenceImages(urls: string[]) {
    setDesignReferenceImageUrls((current) => [...current, ...urls]);
  }

  function removeDesignReferenceImage(url: string) {
    setDesignReferenceImageUrls((current) =>
      current.filter((existingUrl) => existingUrl !== url)
    );
  }

  function saveEdit(fields: UpdatePendingBookingFields) {
    setError(null);
    startTransition(async () => {
      const result = await updatePendingBookingRequestAction(
        bookingRequestId,
        { ...fields, designReferenceImageUrls }
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
    designReferenceImageUrls,
    addDesignReferenceImages,
    removeDesignReferenceImage,
  };
}
