"use client";

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  getWeeklyHoursAction,
  setWeeklyHoursAction,
  type WeeklyHoursSummary,
} from "@/domains/scheduling/actions";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

interface UseWeeklyHoursSettingsArgs {
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

// Data orchestration (CLAUDE.md 20.1): fetches the artist's current
// weekly hours on mount and wraps setWeeklyHoursAction with
// pending/error state. Split out of the former, combined
// useArtistScheduleSettings so the Business & Operating Hours settings
// sub-view can fetch/mutate independently of the Blackout Dates
// sub-view (useScheduleOverrides). Refetches after a successful
// mutation rather than updating state optimistically, so the UI always
// reflects what was actually persisted.
export function useWeeklyHoursSettings({ artistId }: UseWeeklyHoursSettingsArgs) {
  const [weeklyHours, setWeeklyHoursState] = useState<WeeklyHoursSummary[]>(
    defaultWeeklyHours()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    const result = await getWeeklyHoursAction({ artistId });
    setIsLoading(false);

    if (result.success) {
      setWeeklyHoursState(mergeWithDefaults(result.hours));
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

  return {
    weeklyHours,
    isLoading,
    isPending,
    error,
    setDayHours,
  };
}
