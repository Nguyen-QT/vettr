"use client";

import { Button } from "@/components/ui/button";
import { useAppointmentLifecycleActions } from "@/domains/booking/hooks/useAppointmentLifecycleActions";

interface AppointmentLifecycleActionsProps {
  bookingRequestId: string;
}

// Pure view (CLAUDE.md 5.6.5): the "Needs Resolution" list's actions
// footer -- a past-due APPROVED appointment only has two real outcomes
// once its time has passed (it happened, or the client didn't show),
// so this deliberately has no Cancel control -- "cancel" only makes
// sense for a booking that hasn't happened yet (see AppointmentActions,
// which offers it on the upcoming list instead).
export function AppointmentLifecycleActions({
  bookingRequestId,
}: AppointmentLifecycleActionsProps) {
  const { markNoShow, markCompleted, isPending, error } =
    useAppointmentLifecycleActions(bookingRequestId);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={isPending} onClick={markCompleted}>
          Mark completed
        </Button>
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
