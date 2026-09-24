"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getArtistDepositSettingsAction,
  setArtistDepositSettingsAction,
} from "@/domains/billing/actions";
import type { ArtistDepositSettings } from "@/domains/billing/types";
import { COMPLEXITY_TIERS } from "@/domains/booking/constants";
import type { ComplexityTier } from "@/domains/booking/types";

const EMPTY_SETTINGS: ArtistDepositSettings = Object.fromEntries(
  COMPLEXITY_TIERS.map((tier) => [tier, null])
) as ArtistDepositSettings;

// Data orchestration (CLAUDE.md 7.1.7): fetches the signed-in artist's
// own deposit settings on mount -- no artistId arg, since
// getArtistDepositSettingsAction/setArtistDepositSettingsAction are
// fully session-derived (7.1.5). Refetches after a successful mutation
// rather than updating state optimistically, same precedent as
// scheduling's useWeeklyHoursSettings/useScheduleOverrides.
export function useArtistDepositSettings() {
  const [settings, setSettingsState] = useState<ArtistDepositSettings>(EMPTY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const result = await getArtistDepositSettingsAction();
    setIsLoading(false);

    if (result.success) {
      setSettingsState(result.settings);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function setTierDeposit(tier: ComplexityTier, depositAmount: number) {
    setError(null);
    startTransition(async () => {
      const result = await setArtistDepositSettingsAction({ tier, depositAmount });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refetch();
    });
  }

  return { settings, isLoading, isPending, error, setTierDeposit };
}
