"use client";

import { useState, useTransition } from "react";

import {
  approveIntakeRequest,
  declineIntakeRequest,
} from "@/domains/intake/actions";

// Data orchestration (CLAUDE.md): wraps the approve/decline Server Actions
// with pending/result/error state. Deliberately does NOT call
// router.refresh() on success: the dashboard's pending-only query (3.2c)
// would immediately drop this card from the DOM, taking the response
// message with it before the artist can read or copy it. The card is left
// to fall out of the list naturally on the artist's next visit instead.
export function useRequestActions(intakeRequestId: string) {
  const [isPending, startTransition] = useTransition();
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveIntakeRequest(intakeRequestId);
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

  return { approve, decline, isPending, responseMessage, error };
}
