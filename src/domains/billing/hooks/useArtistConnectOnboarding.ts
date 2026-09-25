"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  createConnectOnboardingLinkAction,
  getArtistConnectStatusAction,
} from "@/domains/billing/actions";
import type { ArtistConnectStatus } from "@/domains/billing/types";

const EMPTY_STATUS: ArtistConnectStatus = {
  connected: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

// Data orchestration (CLAUDE.md 24.1.4): fetches the signed-in artist's
// own Connect status on mount -- no artistId arg, since both actions
// are fully session-derived (24.1.3), same precedent as
// useArtistDepositSettings. startOnboarding is the sole mutation here
// (one action, not several independently-triggerable ones), so it gets
// its own isPending/error pair per Independent Mutation State
// Isolation, distinct from the mount-fetch's isLoading/error -- a
// failed onboarding-link request should never look like a failed
// status refresh, or vice versa.
export function useArtistConnectOnboarding() {
  const [status, setStatus] = useState<ArtistConnectStatus>(EMPTY_STATUS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const result = await getArtistConnectStatusAction();
    setIsLoading(false);

    if (result.success) {
      setStatus(result.status);
    } else {
      setLoadError(result.error);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function startOnboarding() {
    setOnboardingError(null);
    startTransition(async () => {
      const result = await createConnectOnboardingLinkAction();
      if (!result.success) {
        setOnboardingError(result.error);
        return;
      }
      window.location.href = result.url;
    });
  }

  return {
    status,
    isLoading,
    loadError,
    isPending,
    onboardingError,
    startOnboarding,
    refetch,
  };
}
