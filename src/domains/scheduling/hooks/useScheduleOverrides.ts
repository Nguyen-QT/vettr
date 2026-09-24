"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getScheduleOverridesAction,
  setScheduleOverrideAction,
  setScheduleOverrideRangeAction,
  type ScheduleOverrideSummary,
} from "@/domains/scheduling/actions";
import type { SlotTime } from "@/domains/scheduling/types";

interface UseScheduleOverridesArgs {
  artistId: string;
}

// Data orchestration (CLAUDE.md 20.1): fetches the artist's current
// date overrides on mount and wraps setScheduleOverrideAction /
// setScheduleOverrideRangeAction with pending/error state. Split out
// of the former, combined useArtistScheduleSettings so the Blackout
// Dates settings sub-view can fetch/mutate independently of the
// Business & Operating Hours sub-view (useWeeklyHoursSettings).
//
// setOverride (single date) and setOverrideRange (a continuous
// range) are two independently-triggerable mutations, so per the
// Independent Mutation State Isolation rule (CLAUDE.md Architecture)
// each gets its own isPending/error pair -- unlike the pre-existing,
// tracked-separately gap in the old combined hook (CLAUDE.md 25.2),
// this hook is new as of this pass and starts from the rule's actual
// requirement rather than carrying the gap forward.
export function useScheduleOverrides({ artistId }: UseScheduleOverridesArgs) {
  const [overrides, setOverrides] = useState<ScheduleOverrideSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isSettingOverride, startSettingOverride] = useTransition();
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const [isSettingRange, startSettingRange] = useTransition();
  const [rangeError, setRangeError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const result = await getScheduleOverridesAction({ artistId });
    setIsLoading(false);

    if (result.success) {
      setOverrides(result.overrides);
    }
  }, [artistId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function setOverride(date: string, availableTimes: SlotTime[]) {
    setOverrideError(null);
    startSettingOverride(async () => {
      const result = await setScheduleOverrideAction({
        artistId,
        date,
        availableTimes,
      });
      if (!result.success) {
        setOverrideError(result.error);
        return;
      }
      await refetch();
    });
  }

  function setOverrideRange(
    startDate: string,
    endDate: string,
    availableTimes: SlotTime[]
  ) {
    setRangeError(null);
    startSettingRange(async () => {
      const result = await setScheduleOverrideRangeAction({
        artistId,
        startDate,
        endDate,
        availableTimes,
      });
      if (!result.success) {
        setRangeError(result.error);
        return;
      }
      await refetch();
    });
  }

  return {
    overrides,
    isLoading,
    isSettingOverride,
    overrideError,
    setOverride,
    isSettingRange,
    rangeError,
    setOverrideRange,
  };
}
