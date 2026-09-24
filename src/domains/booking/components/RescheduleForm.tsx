"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { useRescheduleBooking } from "@/domains/booking/hooks/useRescheduleBooking";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";
import {
  DAILY_SLOT_TIME_OPTIONS,
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

interface RescheduleFormProps {
  appointment: UpcomingAppointmentSummary;
  onCancel: () => void;
  onSaved: () => void;
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

// Pure view (CLAUDE.md 19.1.5): the reschedule form itself, extracted
// out of AppointmentActions' inline editing branch so both desktop
// (still rendered inline, within the same panel) and the mobile
// stack's dedicated edit screen can render it -- desktop toggles it in
// place, mobile slides to a whole new screen, but the form and its
// save/cancel semantics are identical either way. onCancel/onSaved let
// each caller decide what "done with this form" means for its own
// navigation model (AppointmentActions' own isEditing toggle vs.
// useAppointmentCalendar's goBack()).
export function RescheduleForm({ appointment, onCancel, onSaved }: RescheduleFormProps) {
  const { saveReschedule, isPending, error } = useRescheduleBooking(appointment.id, {
    onSuccess: onSaved,
  });

  const rescheduleConfirm = useConfirmAction();

  const defaultDurationMinutes =
    (appointment.endTime.getTime() - appointment.startTime.getTime()) / 60_000;

  const [requestedDate, setRequestedDate] = useState(() =>
    toRequestedDateValue(appointment.startTime)
  );
  const [requestedTime, setRequestedTime] = useState<SlotTime>(() =>
    toRequestedTimeValue(appointment.startTime)
  );
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);

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
            rescheduleConfirm.requestConfirmation(() =>
              saveReschedule({ requestedDate, requestedTime, durationMinutes })
            )
          }
        >
          Save new time
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ConfirmDialog
        open={rescheduleConfirm.isOpen}
        onOpenChange={rescheduleConfirm.onOpenChange}
        title="Save this new time?"
        description="This immediately moves the appointment -- the client isn't asked to confirm on-platform."
        confirmLabel="Save new time"
        onConfirm={rescheduleConfirm.confirm}
      />
    </div>
  );
}
