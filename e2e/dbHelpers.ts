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
// 
// Clamped to stay within today's calendar day (mirroring
// global-setup.ts's todayStart/todayEnd clamp for this same fixture's
// initial creation) rather than a bare now-1h/now+1h offset -- that
// naive version is exactly what caused this test to flake: when this
// UPDATE runs within an hour of local midnight, an unclamped startTime
// rolls onto the previous calendar day, getPastDueAppointments still
// returns the row (it only checks startTime < now()), but the
// dashboard's isToday() then disagrees and silently drops the
// appointment from Today's Schedule.
export async function refreshDashboardTodayAppointment(
  clientHandle: string
): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `UPDATE "TimeSlot"
         SET "startTime" = LEAST(
               GREATEST(now() - interval '1 hour', date_trunc('day', now()) + interval '1 minute'),
               date_trunc('day', now()) + interval '23 hours 59 minutes'
             ),
             "endTime" = LEAST(
               now() + interval '1 hour',
               date_trunc('day', now()) + interval '23 hours 59 minutes'
             )
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

// Puts a signup fixture back to "ClientProfile exists, no Account yet" so
// a signup spec can be re-run (Playwright UI mode re-runs a test without
// re-running global-setup.ts, and a completed signup leaves a verified
// Account that makes the next signup return "account already exists").
// Account-only: the ClientProfile/BookingRequest signup depends on stay.
export async function resetClientSignup(email: string): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "Account" WHERE email = $1`, [email]);
  } finally {
    await client.end();
  }
}

// Drops an address's EmailOtpChallenge row (54.3.6.1) so the next request
// issues a fresh code -- otherwise the 60s resend cooldown, the attempt
// count and the 10-per-24h send cap carry over between tests and across
// Playwright UI mode re-runs (which skip global-setup.ts).
export async function resetEmailOtpChallenge(email: string): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "EmailOtpChallenge" WHERE email = $1`, [email]);
  } finally {
    await client.end();
  }
}
