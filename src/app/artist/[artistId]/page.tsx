import Link from "next/link";

import { StatTile } from "@/components/ui/stat-tile";
import { DashboardAppointmentSummaryCard } from "@/domains/booking/components/DashboardAppointmentSummaryCard";
import { DashboardRequestSummaryCard } from "@/domains/booking/components/DashboardRequestSummaryCard";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";
import { getPendingBookingRequests } from "@/domains/booking/services/getPendingBookingRequests";
import { getUpcomingAppointments } from "@/domains/booking/services/getUpcomingAppointments";
import type {
  PendingBookingRequestSummary,
  UpcomingAppointmentSummary,
} from "@/domains/booking/types";

interface ArtistDashboardPageProps {
  params: Promise<{ artistId: string }>;
}

interface UrgentItem {
  kind: "pending" | "needs-resolution";
  request?: PendingBookingRequestSummary;
  appointment?: UpcomingAppointmentSummary;
}

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

// The real dashboard (Phase 22), replacing the placeholder that landed
// with 22.1.3's route relocation. Read-only server-component
// composition, same "Promise.all existing reads directly in the page"
// convention as the calendar page and the nav layout's badge counts --
// no new domain service, since every stat here is a plain sum/count
// over already-fetched arrays.
export default async function ArtistDashboardPage({
  params,
}: ArtistDashboardPageProps) {
  const { artistId } = await params;
  const [pendingRequests, upcomingAppointments, pastDueAppointments] =
    await Promise.all([
      getPendingBookingRequests(artistId),
      getUpcomingAppointments(artistId),
      getPastDueAppointments(artistId),
    ]);

  // Today's Schedule: the union of upcoming + past-due, since a
  // currently-in-progress appointment shows up in getPastDueAppointments
  // (every one of its booked slots has already started), not
  // getUpcomingAppointments -- see both services' own doc comments.
  const todaysAppointments = [...upcomingAppointments, ...pastDueAppointments]
    .filter((appointment) => isToday(appointment.startTime))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const urgentItems: UrgentItem[] = [
    ...pendingRequests.map(
      (request): UrgentItem => ({ kind: "pending", request })
    ),
    ...pastDueAppointments.map(
      (appointment): UrgentItem => ({ kind: "needs-resolution", appointment })
    ),
  ];

  const estimatedUpcomingValue = upcomingAppointments.reduce(
    (total, appointment) => total + (appointment.estimatedPrice ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Pending requests" value={pendingRequests.length} />
          <StatTile
            label="Today's appointments"
            value={todaysAppointments.length}
          />
          <StatTile
            label="Needs resolution"
            value={pastDueAppointments.length}
            tone={pastDueAppointments.length > 0 ? "warning" : "default"}
          />
          <StatTile
            label="Estimated value of upcoming bookings"
            value={`£${estimatedUpcomingValue}`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Estimated value is a sum of upcoming bookings&apos; estimated prices only
          -- it excludes deposits paid, add-ons, and refunds.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Today&apos;s Schedule</h2>
        {todaysAppointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on the books for today.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {todaysAppointments.map((appointment) => (
              <DashboardAppointmentSummaryCard
                key={appointment.id}
                appointment={appointment}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Urgent Action Items</h2>
        {urgentItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing needs your attention right now.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {urgentItems.map((item) =>
              item.kind === "pending" && item.request ? (
                <Link
                  key={item.request.id}
                  href={`/artist/${artistId}/requests`}
                  className="block"
                >
                  <DashboardRequestSummaryCard request={item.request} />
                </Link>
              ) : item.appointment ? (
                <Link
                  key={item.appointment.id}
                  href={`/artist/${artistId}/appointments?tab=needs-resolution`}
                  className="block"
                >
                  <DashboardAppointmentSummaryCard appointment={item.appointment} />
                </Link>
              ) : null
            )}
          </div>
        )}
      </section>
    </div>
  );
}
