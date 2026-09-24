import Image from "next/image";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentDetailDialogProps {
  appointment: UpcomingAppointmentSummary;
  // The card's own summary body, rendered as the dialog's trigger.
  children: ReactNode;
}

const APPOINTMENT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatEstimatedPrice(estimatedPrice: number | null) {
  // Always rendered (CLAUDE.md 18.1), rather than conditionally hidden
  // like AppointmentCard's summary -- a null value here is surfaced as
  // a visible gap instead of silently disappearing.
  return estimatedPrice !== null ? `£${estimatedPrice}` : "Not yet set";
}

// View (CLAUDE.md 18.1.2): expands an AppointmentCard's summary into
// the full booking detail on selection -- every reference image at
// full size, estimated price always shown, tags, notes, client
// contact. Reuses the same UpcomingAppointmentSummary AppointmentCard
// already has, so it needs no domain service of its own.
//
// The trigger renders as a div, not a button: the summary body passed
// in as children already contains a real <a> (the Instagram deep
// link), and nested interactive elements inside a <button> are
// invalid HTML. The anchor stops its own click from bubbling into the
// trigger so it still navigates independently of opening the dialog.
export function AppointmentDetailDialog({
  appointment,
  children,
}: AppointmentDetailDialogProps) {
  const instagramUrl = `https://instagram.com/${appointment.clientInstagramHandle}`;
  const tags = [...appointment.designTags, ...appointment.aestheticTags];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <div
            role="button"
            tabIndex={0}
            aria-label="View appointment detail"
            className="flex cursor-pointer flex-col gap-3 text-left"
          >
            {children}
          </div>
        }
      />
      <DialogContent size="lg">
        <DialogTitle>Appointment detail</DialogTitle>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium underline underline-offset-4"
            >
              @{appointment.clientInstagramHandle}
            </a>
            <span className="text-sm text-muted-foreground">{appointment.tier}</span>
          </div>

          <p className="text-sm text-muted-foreground">
            {appointment.clientEmail}
            {appointment.clientPhone ? ` · ${appointment.clientPhone}` : ""}
          </p>

          <p className="text-sm font-medium">
            {APPOINTMENT_TIME_FORMAT.format(appointment.startTime)} –{" "}
            {APPOINTMENT_TIME_FORMAT.format(appointment.endTime)}
          </p>

          <p className="text-sm font-medium">
            Estimated price: {formatEstimatedPrice(appointment.estimatedPrice)}
          </p>

          {tags.length > 0 ? (
            <p className="text-sm text-muted-foreground">{tags.join(", ")}</p>
          ) : null}

          {appointment.clientNotes ? (
            <>
              <Separator />
              <p className="text-sm">{appointment.clientNotes}</p>
            </>
          ) : null}

          {appointment.designReferenceImageUrls.length > 0 ? (
            <>
              <Separator />
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {appointment.designReferenceImageUrls.map((url) => (
                  <li key={url}>
                    <Image
                      src={url}
                      alt="Design reference"
                      width={300}
                      height={300}
                      className="h-auto w-full rounded-md object-cover"
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
