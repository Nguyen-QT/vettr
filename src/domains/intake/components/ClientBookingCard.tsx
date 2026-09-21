import { ClientBookingActions } from "@/domains/intake/components/ClientBookingActions";
import type { ClientBookingSummary } from "@/domains/intake/types";

interface ClientBookingCardProps {
  booking: ClientBookingSummary;
}

const REQUESTED_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_LABELS: Record<ClientBookingSummary["status"], string> = {
  PENDING: "Pending review",
  AWAITING_SLOT_CONFIRMATION: "Awaiting confirmation",
  APPROVED: "Confirmed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

// Pure view (CLAUDE.md 5.2.4): read-only projection of a booking for
// the client dashboard -- spans every artist the client has booked
// with, so the artist's own name/handle is shown per card rather than
// assumed from page context.
export function ClientBookingCard({ booking }: ClientBookingCardProps) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{booking.artistName}</span>
        <span className="text-sm text-muted-foreground">{booking.tier}</span>
      </div>

      <p className="text-sm text-muted-foreground">
        @{booking.artistInstagramHandle}
      </p>

      <p className="text-sm font-medium">{STATUS_LABELS[booking.status]}</p>

      {booking.requestedStartTime ? (
        <p className="text-sm text-muted-foreground">
          Requested: {REQUESTED_TIME_FORMAT.format(booking.requestedStartTime)}
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {booking.estimatedPrice !== null
          ? `Estimated: £${booking.estimatedPrice}`
          : `£${booking.minPrice} – £${booking.maxPrice}`}
      </p>

      <ClientBookingActions booking={booking} />
    </article>
  );
}
