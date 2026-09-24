import Image from "next/image";

import { Separator } from "@/components/ui/separator";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentDetailProps {
  appointment: UpcomingAppointmentSummary;
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

// Shared, presentation-only view (CLAUDE.md 19.1.2): the full booking
// detail -- every reference image at full size, estimated price
// always shown, tags, notes, client contact -- extracted out of
// AppointmentDetailDialog (CLAUDE.md 18.1.2) so both that dialog and
// Phase 19's desktop persistent panel / mobile slide-in screen render
// the exact same layout instead of duplicating it. Takes no dialog
// concerns of its own (no trigger, no portal) -- purely the field
// markup a caller composes inside whatever chrome it needs.
export function AppointmentDetail({ appointment }: AppointmentDetailProps) {
  const instagramUrl = `https://instagram.com/${appointment.clientInstagramHandle}`;
  const tags = [...appointment.designTags, ...appointment.aestheticTags];

  return (
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
  );
}
