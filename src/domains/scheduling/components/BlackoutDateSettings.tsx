"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import { useScheduleOverrides } from "@/domains/scheduling/hooks/useScheduleOverrides";
import type { SlotTime } from "@/domains/scheduling/types";

interface BlackoutDateSettingsProps {
  artistId: string;
}

// View (CLAUDE.md 20.1): Blackout Dates & Multi-Date Range Overrides
// settings sub-view, split out of the former combined
// BusinessHoursSettings and gaining a continuous date-range picker
// (Start date/End date, an equal pair blocking out a single day) in
// place of the old single-date-only form.
export function BlackoutDateSettings({ artistId }: BlackoutDateSettingsProps) {
  const {
    overrides,
    isLoading,
    isSettingRange,
    rangeError,
    setOverrideRange,
  } = useScheduleOverrides({ artistId });

  if (isLoading) {
    return <p role="status">Loading blackout dates…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldLegend>Date overrides</FieldLegend>
      <RangeOverrideForm isPending={isSettingRange} onSave={setOverrideRange} />
      <FieldError errors={rangeError ? [{ message: rangeError }] : undefined} />
      {overrides.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {overrides.map((override) => (
            <li key={override.date} className="text-sm text-muted-foreground">
              {override.date}:{" "}
              {override.availableTimes.length === 0
                ? "Blackout (fully closed)"
                : override.availableTimes.join(", ")}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface RangeOverrideFormProps {
  isPending: boolean;
  onSave: (startDate: string, endDate: string, availableTimes: SlotTime[]) => void;
}

function RangeOverrideForm({ isPending, onSave }: RangeOverrideFormProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selected, setSelected] = useState<SlotTime[]>([]);

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="override-start-date">Start date</FieldLabel>
        <Input
          id="override-start-date"
          type="date"
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
        />
        <FieldLabel htmlFor="override-end-date">
          End date (leave blank for a single day)
        </FieldLabel>
        <Input
          id="override-end-date"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          {DAILY_SLOT_TIME_OPTIONS.map((time) => {
            const checked = selected.includes(time);
            return (
              <FieldLabel
                key={time}
                htmlFor={`override-${time}`}
                className="text-sm font-normal"
              >
                <Checkbox
                  id={`override-${time}`}
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
        disabled={isPending || !startDate}
        onClick={() => onSave(startDate, endDate || startDate, selected)}
      >
        Save override
      </Button>
    </Field>
  );
}
