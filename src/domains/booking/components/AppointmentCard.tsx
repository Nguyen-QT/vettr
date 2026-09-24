"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { AppointmentDetailDialog } from "@/domains/booking/components/AppointmentDetailDialog";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentCardProps {
  appointment: UpcomingAppointmentSummary;
  // Slot rather than a hardcoded <AppointmentActions> -- the upcoming
  // list (4.5) wants the reschedule control, the past-due "Needs
  // Resolution" list (5.6.5) wants Cancel/No-Show/Complete instead.
  // Same read-only layout, different actions per context.
  actions: ReactNode;
}

const APPOINTMENT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Pure view (CLAUDE.md 4.5): read-only projection of an APPROVED
// request with a booked slot -- unlike RequestCard, there's no
// approve/decline here, since that already happened. The actions
// footer itself is a slot (see actions prop) since it differs by
// context (reschedule vs. cancel/no-show/complete).
//
// The card body is wrapped in AppointmentDetailDialog (CLAUDE.md 18.1)
// so selecting it expands the same fields into a larger detail view
// with full-size reference images and an always-visible estimated
// price. Actions stay outside that wrapper entirely so a mutation
// button never also toggles the dialog.
export function AppointmentCard({ appointment, actions }: AppointmentCardProps) {
  const instagramUrl = `https://instagram.com/${appointment.clientInstagramHandle}`;
  const tags = [...appointment.designTags, ...appointment.aestheticTags];

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <AppointmentDetailDialog appointment={appointment}>
        <div className="flex items-center justify-between">
          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
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

        {appointment.designReferenceImageUrls.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {appointment.designReferenceImageUrls.map((url) => (
              <li key={url}>
                <Image
                  src={url}
                  alt="Design reference"
                  width={96}
                  height={96}
                  className="rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}

        {appointment.estimatedPrice !== null ? (
          <p className="text-sm text-muted-foreground">
            Estimated: £{appointment.estimatedPrice}
          </p>
        ) : null}

        {tags.length > 0 ? (
          <p className="text-sm text-muted-foreground">{tags.join(", ")}</p>
        ) : null}

        {appointment.clientNotes ? (
          <>
            <Separator />
            <p className="text-sm">{appointment.clientNotes}</p>
          </>
        ) : null}
      </AppointmentDetailDialog>

      {actions}
    </article>
  );
}
