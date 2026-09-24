"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import { useWeeklyHoursSettings } from "@/domains/scheduling/hooks/useWeeklyHoursSettings";
import type { SlotTime } from "@/domains/scheduling/types";

interface WeeklyHoursSettingsProps {
  artistId: string;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// View (CLAUDE.md 20.1): Business & Operating Hours settings sub-view,
// split out of the former combined BusinessHoursSettings so it can
// live on its own route independently of Blackout Dates.
export function WeeklyHoursSettings({ artistId }: WeeklyHoursSettingsProps) {
  const { weeklyHours, isLoading, isPending, error, setDayHours } =
    useWeeklyHoursSettings({ artistId });

  if (isLoading) {
    return <p role="status">Loading business hours…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldLegend>Weekly hours</FieldLegend>
      <FieldGroup>
        {weeklyHours.map((day) => (
          <DayHoursRow
            key={day.dayOfWeek}
            dayOfWeek={day.dayOfWeek}
            availableTimes={day.availableTimes}
            isPending={isPending}
            onSave={(times) => setDayHours(day.dayOfWeek, times)}
          />
        ))}
      </FieldGroup>
      <FieldError errors={error ? [{ message: error }] : undefined} />
    </div>
  );
}

interface DayHoursRowProps {
  dayOfWeek: number;
  availableTimes: SlotTime[];
  isPending: boolean;
  onSave: (times: SlotTime[]) => void;
}

function DayHoursRow({
  dayOfWeek,
  availableTimes,
  isPending,
  onSave,
}: DayHoursRowProps) {
  const [selected, setSelected] = useState<SlotTime[]>(availableTimes);

  // Re-syncs local selection after a successful save refetches the
  // hook's state -- without this, editing a different day's row would
  // leave this row's checkboxes showing stale pre-save values.
  useEffect(() => {
    setSelected(availableTimes);
  }, [availableTimes]);

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel>{DAY_NAMES[dayOfWeek]}</FieldLabel>
        <div className="flex flex-wrap gap-3">
          {DAILY_SLOT_TIME_OPTIONS.map((time) => {
            const checked = selected.includes(time);
            return (
              <FieldLabel
                key={time}
                htmlFor={`weekly-${dayOfWeek}-${time}`}
                className="text-sm font-normal"
              >
                <Checkbox
                  id={`weekly-${dayOfWeek}-${time}`}
                  aria-label={`${DAY_NAMES[dayOfWeek]} ${time}`}
                  checked={checked}
                  onCheckedChange={(isChecked) => {
                    setSelected((current) =>
                      isChecked
                        ? [...current, time]
                        : current.filter((value) => value !== time)
                    );
                  }}
                />
                {time}
              </FieldLabel>
            );
          })}
        </div>
      </FieldContent>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onSave(selected)}
      >
        Save
      </Button>
    </Field>
  );
}
