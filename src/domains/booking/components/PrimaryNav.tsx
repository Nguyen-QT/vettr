import Link from "next/link";
import type { ReactNode } from "react";

import type { PrimaryNavProps } from "@/domains/booking/types";

// Small pill badge, same "soft status/tag" styling as RequestCard's
// cancellation-history flag (CLAUDE.md 11.1.2) -- reused here for a
// count rather than a label.
function NavCountBadge({ count }: { count: number }): ReactNode {
  if (count === 0) {
    return null;
  }
  return (
    <span className="rounded-full bg-chart-4/20 px-1.5 py-0.5 text-xs font-medium text-chart-4">
      {count}
    </span>
  );
}

// Pure view (50.1.4.3): the artist header's daily-operations links.
// Account and context actions (Settings, the role switch, Log out) live
// in UserMenu instead. No hooks, so it renders from the server layout
// and inside 50.1.4.4's client-side drawer alike. Plain links with no
// active-state highlighting, same convention as the settings sub-nav.
export function PrimaryNav({
  artistId,
  pendingRequestCount,
  pastDueAppointmentCount,
}: PrimaryNavProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex items-baseline gap-3 text-sm text-muted-foreground"
    >
      <Link href={`/artist/${artistId}`}>Dashboard</Link>
      <Link
        href={`/artist/${artistId}/requests`}
        className="flex items-baseline gap-1.5"
      >
        Requests
        <NavCountBadge count={pendingRequestCount} />
      </Link>
      <Link
        href={`/artist/${artistId}/appointments`}
        className="flex items-baseline gap-1.5"
      >
        Appointments
        <NavCountBadge count={pastDueAppointmentCount} />
      </Link>
      <Link href={`/artist/${artistId}/calendar`}>Calendar</Link>
    </nav>
  );
}
