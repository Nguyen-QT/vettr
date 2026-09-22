import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getPayableDeposits } from "@/domains/billing/services/getPayableDeposits";
import { getCurrentSession, logoutAction } from "@/domains/auth/actions";
import { ClientBookingCard } from "@/domains/booking/components/ClientBookingCard";
import { getApprovedUnpaidRequestSummaries } from "@/domains/booking/services/getApprovedUnpaidRequestSummaries";
import { getClientBookings } from "@/domains/booking/services/getClientBookings";

// Session-derived (CLAUDE.md 5.2): no clientProfileId URL param -- the
// route-protection proxy already guarantees a valid CLIENT session
// reached here, getCurrentSession just reads which one. Composes
// booking's and billing's independent reads itself (CLAUDE.md's Domain
// Boundary Isolation rule) rather than either domain querying the
// other's table directly.
export default async function ClientDashboardPage() {
  const session = await getCurrentSession();
  const bookings = session?.clientProfileId
    ? await getClientBookings(session.clientProfileId)
    : [];
  const payableDeposits = session?.clientProfileId
    ? await getPayableDeposits(
        await getApprovedUnpaidRequestSummaries(session.clientProfileId)
      )
    : {};

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 bg-background">
        <div className="mx-auto flex w-full max-w-lg items-baseline justify-between px-4 py-3">
          <span className="text-base font-semibold">Vettr</span>
          <form action={logoutAction}>
            <Button type="submit" variant="link" className="h-auto p-0 text-sm">
              Log out
            </Button>
          </form>
        </div>
        <Separator />
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-[env(safe-area-inset-bottom)]">
        <Link
          href="/artists"
          className={buttonVariants({ variant: "outline", className: "mb-4 w-full" })}
        >
          Find an artist
        </Link>
        <h1 className="mb-3 text-lg font-semibold">Your bookings</h1>
        {bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">No bookings yet</p>
            <p className="text-sm text-muted-foreground">
              Requests you submit will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <ClientBookingCard
                key={booking.id}
                booking={booking}
                depositAmount={payableDeposits[booking.id] ?? null}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
