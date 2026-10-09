import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import { Client } from "pg";

import { EMAIL_CAPTURE_SINK_PATH } from "./authHelpers";
import { E2E_FIXTURE_EMAIL_PATTERN, type E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

export default async function globalTeardown() {
  config();

  await rm(EMAIL_CAPTURE_SINK_PATH, { force: true });

  const raw = await readFile(FIXTURE_PATH, "utf-8").catch(() => null);
  if (!raw) return;

  const fixture: E2eFixture = JSON.parse(raw);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`DELETE FROM "BookingRequest" WHERE id = ANY($1)`, [
    fixture.bookingRequestIds,
  ]);
  // Also catches any BookingRequest a spec created through the real
  // submission flow rather than seeding it here (e.g.
  // booking-wizard.spec.ts's full-wizard submission, CLAUDE.md 17.1.3)
  // -- not tracked by ID in the fixture, only by the artist it was
  // submitted against -- along with the fresh guest ClientProfile that
  // same submission created, which would otherwise be left orphaned.
  const adHocRequests = await client.query<{ clientId: string }>(
    `DELETE FROM "BookingRequest" WHERE "artistId" = $1 RETURNING "clientId"`,
    [fixture.artistId]
  );
  const adHocClientIds = adHocRequests.rows
    .map((row) => row.clientId)
    .filter((id) => !fixture.clientProfileIds.includes(id));
  if (adHocClientIds.length > 0) {
    // A guest who proved their email by code (54.5) also got an Account
    // linked to that profile -- ON DELETE SET NULL, so it would outlive
    // the profile delete below. Its Sessions cascade.
    await client.query(`DELETE FROM "Account" WHERE "clientProfileId" = ANY($1)`, [
      adHocClientIds,
    ]);
    await client.query(`DELETE FROM "ClientProfile" WHERE id = ANY($1)`, [
      adHocClientIds,
    ]);
  }
  // Account.clientProfileId is ON DELETE SET NULL (CLAUDE.md 5.1.1),
  // same reasoning as the artist Account cleanup below -- must clear
  // the seeded client Accounts before the ClientProfile delete, or
  // they'd be left orphaned.
  await client.query(`DELETE FROM "Account" WHERE "clientProfileId" = ANY($1)`, [
    fixture.clientProfileIds,
  ]);
  await client.query(`DELETE FROM "ClientProfile" WHERE id = ANY($1)`, [
    fixture.clientProfileIds,
  ]);
  // EmailOtpChallenge has no FK (54.3.1.1), so nothing above cascades to
  // it. Matched by global-setup's own sweep pattern rather than by address:
  // a booking code (54.5) goes to a fresh guest address on every run, and a
  // guest whose code was rejected leaves no Account or profile to find it by.
  await client.query(`DELETE FROM "EmailOtpChallenge" WHERE email LIKE $1`, [
    E2E_FIXTURE_EMAIL_PATTERN,
  ]);
  // ArtistWeeklyHours/ArtistScheduleOverride (CLAUDE.md 4.3) reference
  // Artist with ON DELETE RESTRICT -- must clear these before the
  // Artist delete below, or business-hours-settings.spec.ts's writes
  // would leave every subsequent e2e run's teardown failing.
  await client.query(`DELETE FROM "ArtistWeeklyHours" WHERE "artistId" = $1`, [
    fixture.artistId,
  ]);
  await client.query(
    `DELETE FROM "ArtistScheduleOverride" WHERE "artistId" = $1`,
    [fixture.artistId]
  );
  // Same ON DELETE RESTRICT reasoning as above (CLAUDE.md 4.6).
  await client.query(`DELETE FROM "TierReferenceImage" WHERE "artistId" = $1`, [
    fixture.artistId,
  ]);
  // Same ON DELETE RESTRICT reasoning as above (CLAUDE.md 7.1.1).
  await client.query(`DELETE FROM "ArtistDepositSetting" WHERE "artistId" = $1`, [
    fixture.artistId,
  ]);
  // Account.artistId is ON DELETE SET NULL (CLAUDE.md 5.1.1), so it
  // won't clean itself up when Artist is deleted below -- Session
  // cascades from Account automatically. bookingOtpArtistId (54.5.6.2) has
  // only its Account -- none of the per-artist rows above.
  const artistIds = [fixture.artistId, fixture.bookingOtpArtistId];
  await client.query(`DELETE FROM "Account" WHERE "artistId" = ANY($1)`, [
    artistIds,
  ]);
  await client.query(`DELETE FROM "Artist" WHERE id = ANY($1)`, [artistIds]);

  await client.end();
  await rm(FIXTURE_PATH, { force: true });
}
