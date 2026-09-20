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

  await client.query(`DELETE FROM "IntakeRequest" WHERE id = ANY($1)`, [
    fixture.intakeRequestIds,
  ]);
  await client.query(`DELETE FROM "ClientProfile" WHERE id = ANY($1)`, [
    fixture.clientProfileIds,
  ]);
  await client.query(`DELETE FROM "Artist" WHERE id = $1`, [fixture.artistId]);

  await client.end();
  await rm(FIXTURE_PATH, { force: true });
}
