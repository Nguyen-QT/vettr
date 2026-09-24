"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppointmentActions } from "@/domains/booking/components/AppointmentActions";
import { AppointmentCard } from "@/domains/booking/components/AppointmentCard";
import { AppointmentLifecycleActions } from "@/domains/booking/components/AppointmentLifecycleActions";
import {
  type AppointmentsTab,
  useAppointmentsTab,
} from "@/domains/booking/hooks/useAppointmentsTab";
import type { UpcomingAppointmentSummary } from "@/domains/booking/types";

interface AppointmentsTabsProps {
  artistId: string;
  appointments: UpcomingAppointmentSummary[];
  pastDueAppointments: UpcomingAppointmentSummary[];
}

// Pure view (CLAUDE.md 21.1.3): restructures the former stacked
// Upcoming/Needs Resolution sections into Tabs, reusing the exact same
// reads/cards -- a layout change only, no new business logic. Tab
// selection is driven by useAppointmentsTab (21.1.2) so it's URL-synced.
export function AppointmentsTabs({
  artistId,
  appointments,
  pastDueAppointments,
}: AppointmentsTabsProps) {
  const { activeTab, setActiveTab } = useAppointmentsTab();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as AppointmentsTab)}
    >
      <TabsList>
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="needs-resolution" className="gap-1.5">
          Needs resolution
          {pastDueAppointments.length > 0 ? (
            <span className="rounded-full bg-chart-4/20 px-1.5 py-0.5 text-xs font-medium text-chart-4">
              {pastDueAppointments.length}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming">
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
      </TabsContent>

      <TabsContent value="needs-resolution">
        {pastDueAppointments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm font-medium">Nothing needs resolution</p>
            <p className="text-sm text-muted-foreground">
              Past-due appointments still needing Mark completed, Mark
              no-show, or Checkout will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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
        )}
      </TabsContent>
    </Tabs>
  );
}
