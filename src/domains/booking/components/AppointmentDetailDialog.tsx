import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AppointmentDetail } from "@/domains/booking/components/AppointmentDetail";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentDetailDialogProps {
  appointment: UpcomingAppointmentSummary;
  // The card's own summary body, rendered as the dialog's trigger.
  children: ReactNode;
}

// View (CLAUDE.md 18.1.2): expands an AppointmentCard's summary into
// the full booking detail on selection, via the shared AppointmentDetail
// component (CLAUDE.md 19.1.2) -- every reference image at full size,
// estimated price always shown, tags, notes, client contact. Reuses
// the same UpcomingAppointmentSummary AppointmentCard already has, so
// it needs no domain service of its own.
//
// The trigger renders as a div, not a button (nativeButton={false}):
// the summary body passed in as children already contains a real <a>
// (the Instagram deep link), and nested interactive elements inside a
// <button> are invalid HTML. nativeButton={false} tells Base UI to
// inject the role/keyboard handling itself rather than assuming the
// rendered element is already natively focusable/clickable. The
// anchor stops its own click from bubbling into the trigger so it
// still navigates independently of opening the dialog.
export function AppointmentDetailDialog({
  appointment,
  children,
}: AppointmentDetailDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        nativeButton={false}
        render={
          <div
            aria-label="View appointment detail"
            className="flex cursor-pointer flex-col gap-3 text-left"
          >
            {children}
          </div>
        }
      />
      <DialogContent size="lg">
        <DialogTitle>Appointment detail</DialogTitle>
        <AppointmentDetail appointment={appointment} />
      </DialogContent>
    </Dialog>
  );
}
