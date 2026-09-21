"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getScheduleOverridesAction,
  getWeeklyHoursAction,
  setScheduleOverrideAction,
  setWeeklyHoursAction,
  type ScheduleOverrideSummary,
  type WeeklyHoursSummary,
} from "@/domains/scheduling/actions";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

interface UseArtistScheduleSettingsArgs {
  artistId: string;
}

function defaultWeeklyHours(): WeeklyHoursSummary[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    availableTimes: [...DAILY_SLOT_TIME_OPTIONS],
  }));
}

// A day with no ArtistWeeklyHours row defaults to fully open
// (getOperatingWindows' fallback, CLAUDE.md 4.3) -- fills in that
// default here too, so the settings UI always has all 7 days to
// render rather than only the ones the artist has already touched.
function mergeWithDefaults(rows: WeeklyHoursSummary[]): WeeklyHoursSummary[] {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row.availableTimes]));
  return defaultWeeklyHours().map((day) => ({
    dayOfWeek: day.dayOfWeek,
    availableTimes: byDay.get(day.dayOfWeek) ?? day.availableTimes,
  }));
}

// Data orchestration (CLAUDE.md 4.3): fetches the artist's current
// weekly hours/overrides on mount, and wraps the set* Server Actions
// with pending/error state. Refetches after a successful mutation
// rather than updating state optimistically, so the UI always reflects
// what was actually persisted.
export function useArtistScheduleSettings({
  artistId,
}: UseArtistScheduleSettingsArgs) {
  const [weeklyHours, setWeeklyHoursState] = useState<WeeklyHoursSummary[]>(
    defaultWeeklyHours()
  );
  const [overrides, setOverrides] = useState<ScheduleOverrideSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const [hoursResult, overridesResult] = await Promise.all([
      getWeeklyHoursAction({ artistId }),
      getScheduleOverridesAction({ artistId }),
    ]);
    setIsLoading(false);

    if (hoursResult.success) {
      setWeeklyHoursState(mergeWithDefaults(hoursResult.hours));
    }
    if (overridesResult.success) {
      setOverrides(overridesResult.overrides);
    }
  }, [artistId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function setDayHours(dayOfWeek: number, availableTimes: SlotTime[]) {
    setError(null);
    startTransition(async () => {
      const result = await setWeeklyHoursAction({
        artistId,
        dayOfWeek,
        availableTimes,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refetch();
    });
  }

  function setOverride(date: string, availableTimes: SlotTime[]) {
    setError(null);
    startTransition(async () => {
      const result = await setScheduleOverrideAction({
        artistId,
        date,
        availableTimes,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      await refetch();
    });
  }

  return {
    weeklyHours,
    overrides,
    isLoading,
    isPending,
    error,
    setDayHours,
    setOverride,
  };
}
