import { Suspense } from "react";

import { AppointmentsTabs } from "@/domains/booking/components/AppointmentsTabs";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";
import { getUpcomingAppointments } from "@/domains/booking/services/getUpcomingAppointments";

interface ArtistAppointmentsPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistAppointmentsPage({
  params,
}: ArtistAppointmentsPageProps) {
  const { artistId } = await params;
  const [appointments, pastDueAppointments] = await Promise.all([
    getUpcomingAppointments(artistId),
    getPastDueAppointments(artistId),
  ]);

  // AppointmentsTabs calls useSearchParams() via useAppointmentsTab, which
  // requires a Suspense boundary in the App Router -- same precedent as
  // src/app/artist/login/page.tsx wrapping LoginForm.
  return (
    <Suspense>
      <AppointmentsTabs
        artistId={artistId}
        appointments={appointments}
        pastDueAppointments={pastDueAppointments}
      />
    </Suspense>
  );
}
