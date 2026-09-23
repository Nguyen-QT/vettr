"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { useClientBookingActions } from "@/domains/booking/hooks/useClientBookingActions";
import type { ClientBookingSummary } from "@/domains/booking/types";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { SlotTime } from "@/domains/scheduling/types";

interface ClientBookingActionsProps {
  booking: ClientBookingSummary;
}

// Local-time getters, matching combineRequestedDateAndTime's own
// local-time construction (CLAUDE.md: "no timezone handling yet") --
// only meaningful as long as the browser and server agree on a
// timezone, same placeholder scope as the rest of booking.
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

const CANCELLABLE_STATUSES = new Set([
  "PENDING",
  "AWAITING_SLOT_CONFIRMATION",
  "APPROVED",
]);

// Pure view (CLAUDE.md 5.4.4): renders whatever useClientBookingActions
// reports. Only PENDING requests are editable (server-enforced too,
// see updatePendingBookingRequest); PENDING/AWAITING_SLOT_CONFIRMATION/
// APPROVED are all cancellable, with the 48-hour APPROVED window
// enforced server-side -- a rejected attempt just surfaces as `error`.
export function ClientBookingActions({ booking }: ClientBookingActionsProps) {
  const { cancel, isEditing, startEditing, cancelEditing, saveEdit, isPending, error } =
    useClientBookingActions(booking.id);

  const cancelConfirm = useConfirmAction();
  const saveConfirm = useConfirmAction();

  const [clientNotes, setClientNotes] = useState(booking.clientNotes ?? "");
  const [minPrice, setMinPrice] = useState(booking.minPrice);
  const [maxPrice, setMaxPrice] = useState(booking.maxPrice);
  const [requestedDate, setRequestedDate] = useState(() =>
    booking.requestedStartTime ? toRequestedDateValue(booking.requestedStartTime) : ""
  );
  const [requestedTime, setRequestedTime] = useState<SlotTime>(() =>
    booking.requestedStartTime
      ? toRequestedTimeValue(booking.requestedStartTime)
      : DAILY_SLOT_TIME_OPTIONS[0]
  );

  if (!CANCELLABLE_STATUSES.has(booking.status)) {
    return null;
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <Field>
          <FieldLabel htmlFor={`notes-${booking.id}`}>Notes</FieldLabel>
          <Textarea
            id={`notes-${booking.id}`}
            value={clientNotes}
            onChange={(event) => setClientNotes(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`min-price-${booking.id}`}>
            Budget range (£)
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id={`min-price-${booking.id}`}
              type="number"
              min={0}
              step={5}
              value={minPrice}
              onChange={(event) => setMinPrice(Number(event.target.value))}
            />
            <Input
              type="number"
              min={0}
              step={5}
              value={maxPrice}
              onChange={(event) => setMaxPrice(Number(event.target.value))}
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`requested-date-${booking.id}`}>
            Preferred date
          </FieldLabel>
          <Input
            id={`requested-date-${booking.id}`}
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
              <RadioGroupItem value={time} id={`requested-time-${booking.id}-${time}`} />
              {time}
            </label>
          ))}
        </RadioGroup>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={isPending}
            onClick={() =>
              saveConfirm.requestConfirmation(() =>
                saveEdit({
                  clientNotes: clientNotes || undefined,
                  clientBudgetRange: { minPrice, maxPrice },
                  requestedDate,
                  requestedTime,
                })
              )
            }
          >
            Save
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={cancelEditing}
          >
            Cancel editing
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <ConfirmDialog
          open={saveConfirm.isOpen}
          onOpenChange={saveConfirm.onOpenChange}
          title="Save these changes?"
          description="This updates your booking request's notes, budget, and requested date/time."
          confirmLabel="Save changes"
          onConfirm={saveConfirm.confirm}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {booking.status === "PENDING" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => startEditing(booking.designReferenceImageUrls)}
          >
            Edit
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => cancelConfirm.requestConfirmation(cancel)}
        >
          Cancel booking
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ConfirmDialog
        open={cancelConfirm.isOpen}
        onOpenChange={cancelConfirm.onOpenChange}
        title="Cancel this booking?"
        description="This cannot be undone. Depending on the booking's status, any paid deposit may or may not be refunded automatically."
        confirmLabel="Cancel booking"
        variant="destructive"
        onConfirm={cancelConfirm.confirm}
      />
    </div>
  );
}
