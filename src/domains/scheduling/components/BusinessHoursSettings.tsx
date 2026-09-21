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
import { Input } from "@/components/ui/input";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import { useArtistScheduleSettings } from "@/domains/scheduling/hooks/useArtistScheduleSettings";
import type { SlotTime } from "@/domains/scheduling/types";

interface BusinessHoursSettingsProps {
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

export function BusinessHoursSettings({ artistId }: BusinessHoursSettingsProps) {
  const {
    weeklyHours,
    overrides,
    isLoading,
    isPending,
    error,
    setDayHours,
    setOverride,
  } = useArtistScheduleSettings({ artistId });

  if (isLoading) {
    return <p role="status">Loading business hours…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
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
      </section>

      <section className="flex flex-col gap-3">
        <FieldLegend>Date overrides</FieldLegend>
        <OverrideForm isPending={isPending} onSave={setOverride} />
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
      </section>

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

interface OverrideFormProps {
  isPending: boolean;
  onSave: (date: string, availableTimes: SlotTime[]) => void;
}

function OverrideForm({ isPending, onSave }: OverrideFormProps) {
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<SlotTime[]>([]);

  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor="override-date">Date</FieldLabel>
        <Input
          id="override-date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
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
        disabled={isPending || !date}
        onClick={() => onSave(date, selected)}
      >
        Save override
      </Button>
    </Field>
  );
}
