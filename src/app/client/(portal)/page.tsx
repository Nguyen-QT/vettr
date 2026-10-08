import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { PortalGateSection } from "@/components/ui/portal-gate-section";
import { getPayableDeposits } from "@/domains/billing/services/getPayableDeposits";
import { getCurrentSession } from "@/domains/auth/actions";
import { ClientBookingCard } from "@/domains/booking/components/ClientBookingCard";
import { getApprovedUnpaidRequestSummaries } from "@/domains/booking/services/getApprovedUnpaidRequestSummaries";
import { getClientBookings } from "@/domains/booking/services/getClientBookings";
import { FindArtistContainer } from "@/domains/directory/components/FindArtistContainer";

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
    <>
      <div className="mb-4 flex gap-2">
        <Link
          href="/client/profile"
          className={buttonVariants({ variant: "outline", className: "flex-1" })}
        >
          Your profile
        </Link>
      </div>
      {/* Inline finder (54.4.6.2) in place of the old /artists directory
          link: no public directory, clients reach an artist by handle. */}
      <PortalGateSection title="Find an artist" className="mb-6">
        <FindArtistContainer />
      </PortalGateSection>
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
    </>
  );
}
