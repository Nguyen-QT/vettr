import { randomUUID } from "node:crypto";

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

// Sets an Account's lockout state directly (28.11.6.1), so the lockout spec
// starts each test from a known row -- UI mode re-runs skip global-setup.ts.
// lockedUntil is bound as a UTC ISO string, never a Date: node-postgres
// serialises a Date in this process's local zone, "lockedUntil" is a
// timestamp without a time zone (the offset is dropped), and the app reads
// it back as UTC, so under BST a lock that expired a minute ago would land
// 59 minutes in the future. Throws unless exactly one row matched, so a
// missing fixture can't leave a test running against unseeded state.
export async function setArtistLoginLockout(
  email: string,
  failedLoginAttempts: number,
  lockedUntil: Date | null
): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE "Account"
       SET "failedLoginAttempts" = $2, "lockedUntil" = $3::timestamp(3)
       WHERE email = $1`,
      [email, failedLoginAttempts, lockedUntil?.toISOString() ?? null]
    );
    if (result.rowCount !== 1) {
      throw new Error(`setArtistLoginLockout: no Account for ${email}`);
    }
  } finally {
    await client.end();
  }
}

// Mirrors src/domains/auth/constants.ts's MAX_EMAIL_OTP_SENDS_PER_WINDOW --
// duplicated rather than imported, same reasoning as authHelpers.ts's
// SESSION_COOKIE_NAME.
const MAX_EMAIL_OTP_SENDS_PER_WINDOW = 10;

// Replaces an address's EmailOtpChallenge row (28.11.6.2) with one that has
// used its whole send window, so only the cap can block the next request:
// sentAt is past the 60s cooldown and windowStartedAt is well inside the 24h
// window, so neither the cooldown nor the rollover can explain a skipped send.
// The column has no DB default for id (cuid() is Prisma-side).
//
// Timestamps are bound as UTC ISO strings for the same reason as
// setArtistLoginLockout above -- a bare Date would put sentAt in the future
// under BST, and the cooldown would block instead of the cap. They come from
// the Node clock, not Postgres now(): the Next server compares against this
// host's clock, not the database container's.
export async function seedEmailOtpChallengeAtSendCap(email: string): Promise<void> {
  config();
  const now = Date.now();
  const sentAt = new Date(now - 2 * 60_000);
  const windowStartedAt = new Date(now - 60 * 60_000);
  const expiresAt = new Date(sentAt.getTime() + 15 * 60_000);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`DELETE FROM "EmailOtpChallenge" WHERE email = $1`, [email]);
    await client.query(
      `INSERT INTO "EmailOtpChallenge"
         (id, email, purpose, "expiresAt", "sentAt", "windowStartedAt", "windowSendCount")
       VALUES (
         $1, $2, 'CLIENT_SIGN_IN',
         $3::timestamp(3), $4::timestamp(3), $5::timestamp(3), $6
       )`,
      [
        randomUUID(),
        email,
        expiresAt.toISOString(),
        sentAt.toISOString(),
        windowStartedAt.toISOString(),
        MAX_EMAIL_OTP_SENDS_PER_WINDOW,
      ]
    );
  } finally {
    await client.end();
  }
}

// Drops every BookingRequest on the ClientProfile with this email (54.5.6.2)
// so a spec that submits as an existing client can pin the dashboard's
// booking count across Playwright UI mode re-runs. DesignReference rows
// cascade.
export async function resetClientBookingRequests(email: string): Promise<void> {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `DELETE FROM "BookingRequest"
       WHERE "clientId" IN (SELECT id FROM "ClientProfile" WHERE email = $1)`,
      [email]
    );
  } finally {
    await client.end();
  }
}
