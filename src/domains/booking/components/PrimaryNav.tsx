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
// and inside MobileNavDrawer (50.1.4.4) alike. Plain links with no
// active-state highlighting, same convention as the settings sub-nav.
// The "bar" hides below `lg`, where MobileNavDrawer's trigger (`lg:hidden`)
// takes over -- keep the two breakpoints in step.
export function PrimaryNav({
  artistId,
  pendingRequestCount,
  pastDueAppointmentCount,
  variant = "bar",
}: PrimaryNavProps) {
  const isDrawer = variant === "drawer";
  const navClassName = isDrawer
    ? "flex flex-col text-base text-foreground"
    : "hidden items-baseline gap-3 text-sm text-muted-foreground lg:flex";
  const linkClassName = isDrawer
    ? "flex items-baseline gap-1.5 py-2"
    : "flex items-baseline gap-1.5";

  return (
    <nav aria-label="Primary" className={navClassName}>
      <Link href={`/artist/${artistId}`} className={linkClassName}>
        Dashboard
      </Link>
      <Link href={`/artist/${artistId}/requests`} className={linkClassName}>
        Requests
        <NavCountBadge count={pendingRequestCount} />
      </Link>
      <Link href={`/artist/${artistId}/appointments`} className={linkClassName}>
        Appointments
        <NavCountBadge count={pastDueAppointmentCount} />
      </Link>
      <Link href={`/artist/${artistId}/calendar`} className={linkClassName}>
        Calendar
      </Link>
    </nav>
  );
}
