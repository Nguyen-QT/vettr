import { ArtistCalendarView } from "@/domains/booking/components/ArtistCalendarView";
import { getPastDueAppointments } from "@/domains/booking/services/getPastDueAppointments";
import { getUpcomingAppointments } from "@/domains/booking/services/getUpcomingAppointments";

interface ArtistCalendarPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistCalendarPage({ params }: ArtistCalendarPageProps) {
  const { artistId } = await params;
  const [upcoming, pastDue] = await Promise.all([
    getUpcomingAppointments(artistId),
    getPastDueAppointments(artistId),
  ]);

  const appointments = [
    ...upcoming.map((appointment) => ({ ...appointment, isPastDue: false })),
    ...pastDue.map((appointment) => ({ ...appointment, isPastDue: true })),
  ];

  return <ArtistCalendarView artistId={artistId} appointments={appointments} />;
}
