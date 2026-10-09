"use client";

import type { UseFormReturn } from "react-hook-form";
import { Controller } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ClientBookingInput } from "@/domains/booking/types";
import { DAILY_SLOT_TIME_OPTIONS } from "@/domains/scheduling/constants";
import type { AvailableSlot } from "@/domains/scheduling/services/getAvailableSlots";
import type { SlotTime } from "@/domains/scheduling/types";

interface DateSlotFieldsProps {
  form: UseFormReturn<ClientBookingInput>;
  availableSlots: AvailableSlot[] | null;
  isLoadingAvailability: boolean;
  complexityWarning: string | null;
}

// No date picked yet, or the availability fetch hasn't resolved -- don't
// block the user on missing data, only on a confirmed unavailable time.
function isTimeAvailable(
  availableSlots: AvailableSlot[] | null,
  time: SlotTime
): boolean {
  if (!availableSlots) return true;
  return availableSlots.find((slot) => slot.time === time)?.available ?? true;
}

// Pure view (54.5.4.1): preferred date, time slot and must-finish-by time,
// lifted out of VisualBookingForm so the reordered wizard (54.5.6.1) can
// reuse it. Availability and the complexity warning come from the
// caller's hook. Returns a fragment -- the caller's <FieldGroup> owns
// layout.
export function DateSlotFields({
  form,
  availableSlots,
  isLoadingAvailability,
  complexityWarning,
}: DateSlotFieldsProps) {
  const {
    control,
    register,
    formState: { errors },
  } = form;

  return (
    <>
      <Field>
        <FieldLabel htmlFor="requestedDate">Preferred date</FieldLabel>
        <Input
          id="requestedDate"
          type="date"
          {...register("requestedDate")}
        />
        <FieldError errors={errors.requestedDate && [errors.requestedDate]} />
      </Field>

      <Field>
        <FieldLegend variant="label">Preferred time</FieldLegend>
        <Controller
          control={control}
          name="requestedTime"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange}>
              {DAILY_SLOT_TIME_OPTIONS.map((time) => {
                const available = isTimeAvailable(availableSlots, time);
                return (
                  <FieldLabel key={time} htmlFor={`requestedTime-${time}`}>
                    <Field orientation="horizontal">
                      <RadioGroupItem
                        value={time}
                        id={`requestedTime-${time}`}
                        disabled={isLoadingAvailability || !available}
                      />
                      <FieldContent>
                        {time}
                        {!isLoadingAvailability && !available
                          ? " (unavailable)"
                          : null}
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
          )}
        />
        {isLoadingAvailability ? (
          <FieldDescription>Checking availability…</FieldDescription>
        ) : null}
        <FieldError errors={errors.requestedTime && [errors.requestedTime]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="clientMaxEndTime">
          Must be finished by (optional)
        </FieldLabel>
        <Input
          id="clientMaxEndTime"
          type="time"
          {...register("clientMaxEndTime")}
        />
        <FieldDescription>
          Let the artist know if you have a hard deadline, e.g. a flight to
          catch.
        </FieldDescription>
        {complexityWarning ? (
          // Soft, non-blocking nudge -- text-muted-foreground rather
          // than a dedicated warning token, since CLAUDE.md's brand
          // guardrail reserves a chart-*-family token for "soft
          // warnings" that isn't actually defined in globals.css yet
          // (dangling reference, a known gap). Not text-destructive:
          // this never blocks submission, unlike a real FieldError.
          <p className="text-sm text-muted-foreground">{complexityWarning}</p>
        ) : null}
        <FieldError errors={errors.clientMaxEndTime && [errors.clientMaxEndTime]} />
      </Field>
    </>
  );
}
