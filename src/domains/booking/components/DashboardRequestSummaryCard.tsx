import type { PendingBookingRequestSummary } from "@/domains/booking/types";

interface DashboardRequestSummaryCardProps {
  request: PendingBookingRequestSummary;
}

const REQUESTED_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const ACTIONABLE_STATUS_LABEL: Record<
  PendingBookingRequestSummary["status"],
  string
> = {
  PENDING: "New request",
  AWAITING_SLOT_CONFIRMATION: "Awaiting confirmation",
};

// Pure view (CLAUDE.md): a condensed row-style projection of
// PendingBookingRequestSummary for the dashboard's Urgent Action Items
// section (Phase 22). Unlike RequestCard, this has no image grid, no
// notes/tags, and no Approve/Decline actions -- it's meant to be
// scanned quickly, with the full review flow reached via the
// dashboard's link out to /requests.
export function DashboardRequestSummaryCard({
  request,
}: DashboardRequestSummaryCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          @{request.clientInstagramHandle}
        </span>
        {request.requestedStartTime ? (
          <span className="text-sm text-muted-foreground">
            {REQUESTED_TIME_FORMAT.format(request.requestedStartTime)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm text-muted-foreground">{request.tier}</span>
        <span className="text-sm text-muted-foreground">
          {ACTIONABLE_STATUS_LABEL[request.status]}
        </span>
      </div>
    </div>
  );
}
