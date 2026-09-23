import { Separator } from "@/components/ui/separator";
import { AppointmentActions } from "@/domains/booking/components/AppointmentActions";
import { AppointmentCard } from "@/domains/booking/components/AppointmentCard";
import { AppointmentLifecycleActions } from "@/domains/booking/components/AppointmentLifecycleActions";
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

  return (
    <div className="flex flex-col gap-6">
      {pastDueAppointments.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Needs resolution</h2>
            {pastDueAppointments.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                actions={
                  <AppointmentLifecycleActions
                    artistId={artistId}
                    bookingRequestId={appointment.id}
                  />
                }
              />
            ))}
          </div>
          <Separator />
        </>
      ) : null}

      {appointments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">No upcoming appointments</p>
          <p className="text-sm text-muted-foreground">
            Requests you approve will show up here once their booking is
            confirmed.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {appointments.map((appointment) => (
            <AppointmentCard
              key={appointment.id}
              appointment={appointment}
              actions={<AppointmentActions appointment={appointment} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}
