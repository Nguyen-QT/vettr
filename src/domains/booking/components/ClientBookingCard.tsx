import { DepositPaymentCard } from "@/domains/billing/components/DepositPaymentCard";
import type { DepositRefundStatus } from "@/domains/billing/types";
import { ClientBookingActions } from "@/domains/booking/components/ClientBookingActions";
import type { ClientBookingSummary } from "@/domains/booking/types";

interface ClientBookingCardProps {
  booking: ClientBookingSummary;
  // Non-null only for an APPROVED, unpaid booking whose artist has
  // configured a deposit for its tier (CLAUDE.md 7.1.8's
  // getPayableDeposits) -- the page composes this itself.
  depositAmount: number | null;
  // Non-null only once a refund has been recorded for this booking
  // (56.6, billing's getDepositRefundStatuses) -- the page composes this
  // itself too.
  refundStatus: DepositRefundStatus | null;
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

// Where a recorded refund stands (56.6). A FAILED refund never reached
// the client, so they're told to get in touch rather than that it's done.
const REFUND_STATUS_LABELS: Record<DepositRefundStatus, string> = {
  PENDING: "Refund pending",
  SUCCEEDED: "Deposit refunded",
  FAILED: "Contact support",
};

// null when there's nothing to say yet (deposit never paid) -- a
// still-payable deposit surfaces separately via DepositPaymentCard
// below, not here (CLAUDE.md 7.3.5). A recorded refund always wins, and
// only exists for a paid deposit (56.6); a NO_SHOW with a paid deposit
// and no refund is a forfeiture, distinguished by status since there's
// no dedicated "forfeited" field.
function depositStatusLabel(
  booking: ClientBookingSummary,
  refundStatus: DepositRefundStatus | null
): string | null {
  if (refundStatus !== null) return REFUND_STATUS_LABELS[refundStatus];
  if (!booking.depositPaid) return null;
  if (booking.status === "NO_SHOW") return "Deposit forfeited";
  return "Deposit paid";
}

// Pure view (CLAUDE.md 5.2.4): read-only projection of a booking for
// the client dashboard -- spans every artist the client has booked
// with, so the artist's own name/handle is shown per card rather than
// assumed from page context.
export function ClientBookingCard({
  booking,
  depositAmount,
  refundStatus,
}: ClientBookingCardProps) {
  const depositLabel = depositStatusLabel(booking, refundStatus);

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
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

      {depositLabel ? (
        <p className="text-sm font-medium">{depositLabel}</p>
      ) : null}

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
