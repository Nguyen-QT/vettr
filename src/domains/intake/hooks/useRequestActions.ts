"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approveIntakeRequest,
  declineIntakeRequest,
} from "@/domains/intake/actions";

// Data orchestration (CLAUDE.md): wraps the approve/decline Server Actions
// with pending/result/error state. Refreshes the route on success so the
// Server-Component dashboard (3.2c) naturally drops the now-non-PENDING
// card on next render, instead of duplicating query state client-side.
export function useRequestActions(intakeRequestId: string) {
  const router = useRouter();
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
      router.refresh();
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
      router.refresh();
    });
  }

  return { approve, decline, isPending, responseMessage, error };
}
