import { notFound } from "next/navigation";

import { CheckoutView } from "@/domains/billing/components/CheckoutView";
import { getBillingAddons } from "@/domains/billing/services/getBillingAddons";
import { getFinalBillTotal } from "@/domains/billing/services/getFinalBillTotal";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";

interface CheckoutPageProps {
  params: Promise<{ artistId: string; bookingRequestId: string }>;
}

// View & Route (CLAUDE.md 7.5.7): the day-of checkout flow's dedicated
// page. Reads are composed directly here rather than through a
// Controller/Action (7.5.5's actions are mutation-only), same
// precedent as getPayableDeposits (7.1.8/7.1.9). The booking summary
// reuses getPastDueAppointments (booking's own existing read, filtered
// to this one id) rather than adding a new domain service just for
// this page -- checkout is only ever reached from the past-due list,
// so every booking here is already in that read's result set.
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { artistId, bookingRequestId } = await params;

  const [pastDueAppointments, addonsResult, billResult] = await Promise.all([
    getPastDueAppointments(artistId),
    getBillingAddons(bookingRequestId, artistId),
    getFinalBillTotal(bookingRequestId, artistId),
  ]);

  const appointment = pastDueAppointments.find(
    (candidate) => candidate.id === bookingRequestId
  );

  if (!appointment || !addonsResult.success || !billResult.success) {
    notFound();
  }

  return (
    <CheckoutView
      artistId={artistId}
      bookingRequestId={bookingRequestId}
      appointment={appointment}
      addons={addonsResult.addons}
      bill={billResult.bill}
    />
  );
}
