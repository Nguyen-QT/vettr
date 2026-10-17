import Link from "next/link";

import { Separator } from "@/components/ui/separator";
import { getCurrentSession } from "@/domains/auth/actions";
import { UserMenu } from "@/domains/auth/components/UserMenu";
import { MobileNavDrawer } from "@/domains/booking/components/MobileNavDrawer";
import { PrimaryNav } from "@/domains/booking/components/PrimaryNav";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";
import { getPendingBookingRequests } from "@/domains/booking/services/getPendingBookingRequests";

export default async function ArtistDashboardLayout({
  params,
  children,
}: LayoutProps<"/artist/[artistId]">) {
  const { artistId } = await params;
  const [pendingRequests, pastDueAppointments, session] = await Promise.all([
    getPendingBookingRequests(artistId),
    getPastDueAppointments(artistId),
    getCurrentSession(),
  ]);
  const isDualRole = !!session?.artistId && !!session?.clientProfileId;
  const navCounts = {
    pendingRequestCount: pendingRequests.length,
    pastDueAppointmentCount: pastDueAppointments.length,
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3 lg:max-w-6xl">
          {/* Below `lg` the ☰ drawer stands in for the PrimaryNav bar
              (50.1.4.4); UserMenu stays top-right at every width. */}
          <div className="flex items-center gap-2 lg:gap-6">
            <MobileNavDrawer artistId={artistId} {...navCounts} />
            <Link href={`/artist/${artistId}`} className="text-base font-semibold">
              Vettr
            </Link>
            <PrimaryNav artistId={artistId} {...navCounts} />
          </div>
          <UserMenu
            activeRole={session?.activeRole ?? "ARTIST"}
            isDualRole={isDualRole}
            settingsHref={`/artist/${artistId}/settings/hours`}
          />
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)] lg:max-w-6xl">
        {children}
      </main>
    </div>
  );
}
