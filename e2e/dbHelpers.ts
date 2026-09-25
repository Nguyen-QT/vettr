import { config } from "dotenv";
import { Client } from "pg";

// Refreshes the artist-dashboard spec's "today, in-progress" appointment
// fixture immediately before the test that depends on it, rather than
// relying on the value global-setup.ts computed once at the very start
// of the whole e2e run. Two Date.now()-derived writes -- one at setup
// time, one at whatever later moment this specific spec happens to
// execute in a large, multi-worker run -- can straddle a calendar-day
// boundary and make the fixture's fixed date go stale relative to the
// dashboard's own isToday() check at render time. Using Postgres's own
// now() here (rather than a JS Date bound as a query parameter) also
// sidesteps the node-postgres client's local-timezone-dependent Date
// serialization entirely -- the same class of process-timezone
// disagreement reschedule-booking.spec.ts already flags for a
// different fixture.
export async function refreshDashboardTodayAppointment(
  clientHandle: string
): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "TimeSlot"
         SET "startTime" = now() - interval '1 hour',
             "endTime" = now() + interval '1 hour'
       WHERE "bookingRequestId" = (
         SELECT br.id
         FROM "BookingRequest" br
         JOIN "ClientProfile" cp ON cp.id = br."clientId"
         WHERE cp."instagramHandle" = $1
       )`,
      [clientHandle]
    );
  } finally {
    await client.end();
  }
}
