"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TIER_BASELINE_BUDGETS } from "@/domains/booking/constants";
import {
  MAX_TOTAL_SERVICE_DURATION_MINUTES,
  MIN_SLOT_DURATION_MINUTES,
} from "@/domains/scheduling/constants";
import { useRequestActions } from "@/domains/booking/hooks/useRequestActions";
import type { ActionableRequestStatus, ComplexityTier } from "@/domains/booking/types";

interface RequestActionsProps {
  bookingRequestId: string;
  status: ActionableRequestStatus;
  tier: ComplexityTier;
}

// A FREESTYLE client's own budget is often an overestimate of what the
// artist will actually charge -- they may simplify or add complexity
// to the design once they've seen the reference images. TIER_2's
// baseline minimum is a reasonable low starting point for the artist
// to adjust from, rather than defaulting to 0.
function defaultEstimatedPrice(tier: ComplexityTier): number {
  return tier === "FREESTYLE" ? TIER_BASELINE_BUDGETS.TIER_2.minPrice : 0;
}

// Pure view (CLAUDE.md): renders whatever useRequestActions reports, makes
// no decisions of its own beyond which control set the request's status
// calls for — the hook owns all review/confirm/decline state.
export function RequestActions({
  bookingRequestId,
  status,
  tier,
}: RequestActionsProps) {
  const { review, confirmBooking, decline, isPending, responseMessage, error } =
    useRequestActions(bookingRequestId);
  const [copied, setCopied] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(MIN_SLOT_DURATION_MINUTES);
  const [estimatedPrice, setEstimatedPrice] = useState(() =>
    defaultEstimatedPrice(tier)
  );

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
        <FieldLabel htmlFor={`duration-${bookingRequestId}`}>
          Service duration (minutes)
        </FieldLabel>
        <Input
          id={`duration-${bookingRequestId}`}
          type="number"
          min={MIN_SLOT_DURATION_MINUTES}
          max={MAX_TOTAL_SERVICE_DURATION_MINUTES}
          value={durationMinutes}
          onChange={(event) => setDurationMinutes(Number(event.target.value))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`estimated-price-${bookingRequestId}`}>
          Estimated price (£)
        </FieldLabel>
        <Input
          id={`estimated-price-${bookingRequestId}`}
          type="number"
          min={0}
          step="0.01"
          value={estimatedPrice}
          onChange={(event) => setEstimatedPrice(Number(event.target.value))}
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => review(durationMinutes, estimatedPrice)}
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
