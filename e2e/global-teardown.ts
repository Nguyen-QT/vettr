import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import { Client } from "pg";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

export default async function globalTeardown() {
  config();

  const raw = await readFile(FIXTURE_PATH, "utf-8").catch(() => null);
  if (!raw) return;

  const fixture: E2eFixture = JSON.parse(raw);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(`DELETE FROM "BookingRequest" WHERE id = ANY($1)`, [
    fixture.bookingRequestIds,
  ]);
  // Account.clientProfileId is ON DELETE SET NULL (CLAUDE.md 5.1.1),
  // same reasoning as the artist Account cleanup below -- must clear
  // any client Account (e.g. one created by the signup spec, 5.2.4)
  // before the ClientProfile delete, or it'd be left orphaned.
  await client.query(`DELETE FROM "Account" WHERE "clientProfileId" = ANY($1)`, [
    fixture.clientProfileIds,
  ]);
  await client.query(`DELETE FROM "ClientProfile" WHERE id = ANY($1)`, [
    fixture.clientProfileIds,
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
  // cascades from Account automatically.
  await client.query(`DELETE FROM "Account" WHERE "artistId" = $1`, [
    fixture.artistId,
  ]);
  await client.query(`DELETE FROM "Artist" WHERE id = $1`, [fixture.artistId]);

  await client.end();
  await rm(FIXTURE_PATH, { force: true });
}
