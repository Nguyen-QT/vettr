import { DepositPaymentCard } from "@/domains/billing/components/DepositPaymentCard";
import { ClientBookingActions } from "@/domains/booking/components/ClientBookingActions";
import type { ClientBookingSummary } from "@/domains/booking/types";

interface ClientBookingCardProps {
  booking: ClientBookingSummary;
  // Non-null only for an APPROVED, unpaid booking whose artist has
  // configured a deposit for its tier (CLAUDE.md 7.1.8's
  // getPayableDeposits) -- the page composes this itself.
  depositAmount: number | null;
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
  CANCELLED_BY_CLIENT: "Cancelled",
  CANCELLED_BY_ARTIST: "Cancelled by artist",
  NO_SHOW: "No-show",
  COMPLETED: "Completed",
};

// Pure view (CLAUDE.md 5.2.4): read-only projection of a booking for
// the client dashboard -- spans every artist the client has booked
// with, so the artist's own name/handle is shown per card rather than
// assumed from page context.
export function ClientBookingCard({ booking, depositAmount }: ClientBookingCardProps) {
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

      {depositAmount !== null ? (
        <DepositPaymentCard
          bookingRequestId={booking.id}
          depositAmount={depositAmount}
        />
      ) : null}

      <ClientBookingActions booking={booking} />
    </article>
  );
}
