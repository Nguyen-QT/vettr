import { AppointmentCard } from "@/domains/intake/components/AppointmentCard";
import { getUpcomingAppointments } from "@/domains/intake/services/getUpcomingAppointments";

interface ArtistAppointmentsPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistAppointmentsPage({
  params,
}: ArtistAppointmentsPageProps) {
  const { artistId } = await params;
  const appointments = await getUpcomingAppointments(artistId);

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-sm font-medium">No upcoming appointments</p>
        <p className="text-sm text-muted-foreground">
          Requests you approve will show up here once their booking is
          confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {appointments.map((appointment) => (
        <AppointmentCard key={appointment.id} appointment={appointment} />
      ))}
    </div>
  );
}
