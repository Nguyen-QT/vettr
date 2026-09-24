"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirmAction } from "@/components/ui/use-confirm-action";
import { RescheduleForm } from "@/domains/booking/components/RescheduleForm";
import { useAppointmentLifecycleActions } from "@/domains/booking/hooks/useAppointmentLifecycleActions";
import { useRescheduleBooking } from "@/domains/booking/hooks/useRescheduleBooking";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentActionsProps {
  appointment: UpcomingAppointmentSummary;
  // CLAUDE.md 19.1.5: on mobile, "Reschedule" navigates to a dedicated
  // full-screen edit step (useAppointmentCalendar's screen: "edit")
  // rather than toggling the form in place -- when provided, clicking
  // Reschedule calls this instead of the component's own startEditing,
  // and the inline RescheduleForm below is skipped since the mobile
  // edit screen renders its own. Desktop omits this prop and keeps
  // today's inline-toggle behavior exactly as before.
  onStartReschedule?: () => void;
}

// Pure view (CLAUDE.md 5.5.4/5.6.5, refactored 19.1.5): artist-initiated
// reschedule and cancel controls for an upcoming APPROVED appointment --
// both apply immediately, no client confirmation step (see
// rescheduleApprovedBooking's own reasoning). Cancel deliberately lives
// here rather than on AppointmentLifecycleActions (the past-due list) --
// "cancel" only makes sense for a booking that hasn't happened yet.
export function AppointmentActions({ appointment, onStartReschedule }: AppointmentActionsProps) {
  const { isEditing, startEditing, cancelEditing } = useRescheduleBooking(appointment.id);
  const {
    cancel,
    isPending: isCancelPending,
    error: cancelError,
  } = useAppointmentLifecycleActions(appointment.id);

  const cancelConfirm = useConfirmAction();

  if (!isEditing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStartReschedule ?? startEditing}
          >
            Reschedule
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isCancelPending}
            onClick={() => cancelConfirm.requestConfirmation(cancel)}
          >
            Cancel booking
          </Button>
        </div>
        {cancelError ? <p className="text-sm text-destructive">{cancelError}</p> : null}
        <ConfirmDialog
          open={cancelConfirm.isOpen}
          onOpenChange={cancelConfirm.onOpenChange}
          title="Cancel this booking?"
          description="This cannot be undone. Depending on the booking's status, any paid deposit is refunded automatically."
          confirmLabel="Cancel booking"
          variant="destructive"
          onConfirm={cancelConfirm.confirm}
        />
      </div>
    );
  }

  return (
    <RescheduleForm appointment={appointment} onCancel={cancelEditing} onSaved={cancelEditing} />
  );
}
