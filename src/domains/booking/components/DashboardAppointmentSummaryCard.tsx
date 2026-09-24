import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface DashboardAppointmentSummaryCardProps {
  appointment: UpcomingAppointmentSummary;
}

const APPOINTMENT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Pure view (CLAUDE.md): a condensed row-style projection of
// UpcomingAppointmentSummary for the dashboard's Today's Schedule and
// Urgent Action Items sections (Phase 22). Unlike AppointmentCard, this
// has no image grid, no actions footer, and no detail-dialog wrapper --
// it's meant to be scanned quickly, with the full detail view reached
// via the dashboard's link out to /appointments.
export function DashboardAppointmentSummaryCard({
  appointment,
}: DashboardAppointmentSummaryCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          @{appointment.clientInstagramHandle}
        </span>
        <span className="text-sm text-muted-foreground">
          {APPOINTMENT_TIME_FORMAT.format(appointment.startTime)} –{" "}
          {APPOINTMENT_TIME_FORMAT.format(appointment.endTime)}
        </span>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm text-muted-foreground">{appointment.tier}</span>
        {appointment.estimatedPrice !== null ? (
          <span className="text-sm text-muted-foreground">
            £{appointment.estimatedPrice}
          </span>
        ) : null}
      </div>
    </div>
  );
}
