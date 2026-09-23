"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAppointmentLifecycleActions } from "@/domains/booking/hooks/useAppointmentLifecycleActions";

interface AppointmentLifecycleActionsProps {
  artistId: string;
  bookingRequestId: string;
}

// Pure view (CLAUDE.md 5.6.5, updated 7.5.7): the "Needs Resolution"
// list's actions footer -- a past-due APPROVED appointment only has
// two real outcomes once its time has passed (it happened, or the
// client didn't show), so this deliberately has no Cancel control --
// "cancel" only makes sense for a booking that hasn't happened yet
// (see AppointmentActions, which offers it on the upcoming list
// instead). "Mark completed" is gone in favor of a Checkout link --
// the day-of checkout flow (7.5) is now the real mechanism for
// closing out an appointment, finalizing it (and transitioning it to
// COMPLETED) only once any day-of add-ons are recorded.
export function AppointmentLifecycleActions({
  artistId,
  bookingRequestId,
}: AppointmentLifecycleActionsProps) {
  const { markNoShow, isPending, error } =
    useAppointmentLifecycleActions(bookingRequestId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/artist/${artistId}/appointments/${bookingRequestId}/checkout`}
          className={buttonVariants({ variant: "default" })}
        >
          Checkout
        </Link>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={markNoShow}
        >
          Mark no-show
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
