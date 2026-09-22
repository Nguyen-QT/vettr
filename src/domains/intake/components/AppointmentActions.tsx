"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRescheduleBooking } from "@/domains/intake/hooks/useRescheduleBooking";
import type { UpcomingAppointmentSummary } from "@/domains/intake/types";
import {
  DAILY_SLOT_TIME_OPTIONS,
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

interface AppointmentActionsProps {
  appointment: UpcomingAppointmentSummary;
}

// Local-time getters, matching combineRequestedDateAndTime's own
// local-time construction (CLAUDE.md: "no timezone handling yet") --
// same approach as ClientBookingActions.tsx's edit form defaults.
function toRequestedDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toRequestedTimeValue(date: Date): SlotTime {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const candidate = `${hours}:${minutes}`;
  return (DAILY_SLOT_TIME_OPTIONS as readonly string[]).includes(candidate)
    ? (candidate as SlotTime)
    : DAILY_SLOT_TIME_OPTIONS[0];
}

// Pure view (CLAUDE.md 5.5.4): artist-initiated reschedule control for
// an APPROVED appointment -- applies immediately on save, no client
// confirmation step (see rescheduleApprovedBooking's own reasoning).
export function AppointmentActions({ appointment }: AppointmentActionsProps) {
  const { isEditing, startEditing, cancelEditing, saveReschedule, isPending, error } =
    useRescheduleBooking(appointment.id);

  const defaultDurationMinutes =
    (appointment.endTime.getTime() - appointment.startTime.getTime()) / 60_000;

  const [requestedDate, setRequestedDate] = useState(() =>
    toRequestedDateValue(appointment.startTime)
  );
  const [requestedTime, setRequestedTime] = useState<SlotTime>(() =>
    toRequestedTimeValue(appointment.startTime)
  );
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);

  if (!isEditing) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={startEditing}>
        Reschedule
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={`reschedule-date-${appointment.id}`}>
          New date
        </FieldLabel>
        <Input
          id={`reschedule-date-${appointment.id}`}
          type="date"
          value={requestedDate}
          onChange={(event) => setRequestedDate(event.target.value)}
        />
      </Field>
      <RadioGroup
        value={requestedTime}
        onValueChange={(value) => setRequestedTime(value as SlotTime)}
      >
        {DAILY_SLOT_TIME_OPTIONS.map((time) => (
          <label key={time} className="flex items-center gap-2 text-sm">
            <RadioGroupItem
              value={time}
              id={`reschedule-time-${appointment.id}-${time}`}
            />
            {time}
          </label>
        ))}
      </RadioGroup>
      <Field>
        <FieldLabel htmlFor={`reschedule-duration-${appointment.id}`}>
          Service duration (minutes)
        </FieldLabel>
        <Input
          id={`reschedule-duration-${appointment.id}`}
          type="number"
          min={MIN_SLOT_DURATION_MINUTES}
          max={MAX_TOTAL_SERVICE_DURATION_MINUTES}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value))}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() =>
            saveReschedule({ requestedDate, requestedTime, durationMinutes })
          }
        >
          Save new time
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={cancelEditing}
        >
          Cancel
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
