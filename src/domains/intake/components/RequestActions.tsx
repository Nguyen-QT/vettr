"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "@/domains/scheduling/constants";
import { useRequestActions } from "@/domains/intake/hooks/useRequestActions";
import type { ActionableRequestStatus } from "@/domains/intake/types";

interface RequestActionsProps {
  intakeRequestId: string;
  status: ActionableRequestStatus;
}

// Pure view (CLAUDE.md): renders whatever useRequestActions reports, makes
// no decisions of its own beyond which control set the request's status
// calls for — the hook owns all review/confirm/decline state.
export function RequestActions({ intakeRequestId, status }: RequestActionsProps) {
  const { review, confirmBooking, decline, isPending, responseMessage, error } =
    useRequestActions(intakeRequestId);
  const [copied, setCopied] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(MIN_SLOT_DURATION_MINUTES);

  async function handleCopy() {
    if (!responseMessage) return;
    await navigator.clipboard.writeText(responseMessage);
    setCopied(true);
  }

  if (responseMessage) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{responseMessage}</p>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied" : "Copy message"}
        </Button>
      </div>
    );
  }

  if (status === "AWAITING_SLOT_CONFIRMATION") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Proposed a double-slot booking — confirm here once you&apos;ve
          agreed the timing with the client off-platform.
        </p>
        <div className="flex gap-2">
          <Button type="button" disabled={isPending} onClick={confirmBooking}>
            Confirm Booking
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={decline}
          >
            Decline
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={`duration-${intakeRequestId}`}>
          Service duration (minutes)
        </FieldLabel>
        <Input
          id={`duration-${intakeRequestId}`}
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
          onClick={() => review(durationMinutes)}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={decline}
        >
          Decline
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
