import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/domains/auth/actions";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";
import { getPendingBookingRequests } from "@/domains/booking/services/getPendingBookingRequests";

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

export default async function ArtistDashboardLayout({
  params,
  children,
}: LayoutProps<"/artist/[artistId]">) {
  const { artistId } = await params;
  const [pendingRequests, pastDueAppointments] = await Promise.all([
    getPendingBookingRequests(artistId),
    getPastDueAppointments(artistId),
  ]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3 lg:max-w-6xl">
          <Link href={`/artist/${artistId}`} className="text-base font-semibold">
            Vettr
          </Link>
          <nav className="flex items-baseline gap-3 text-sm text-muted-foreground">
            <Link href={`/artist/${artistId}`}>Dashboard</Link>
            <Link
              href={`/artist/${artistId}/requests`}
              className="flex items-baseline gap-1.5"
            >
              Requests
              <NavCountBadge count={pendingRequests.length} />
            </Link>
            <Link
              href={`/artist/${artistId}/appointments`}
              className="flex items-baseline gap-1.5"
            >
              Appointments
              <NavCountBadge count={pastDueAppointments.length} />
            </Link>
            <Link href={`/artist/${artistId}/calendar`}>Calendar</Link>
            <Link href={`/artist/${artistId}/settings/hours`}>Settings</Link>
            <form action={logoutAction}>
              <Button type="submit" variant="link" className="h-auto p-0 text-sm">
                Log out
              </Button>
            </form>
          </nav>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)] lg:max-w-6xl">
        {children}
      </main>
    </div>
  );
}
