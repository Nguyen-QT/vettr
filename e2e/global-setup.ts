import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import { Client } from "pg";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

export interface E2eFixture {
  artistId: string;
  clientProfileIds: string[];
  intakeRequestIds: string[];
  approveClientHandle: string;
  declineClientHandle: string;
}

// Seeds one throwaway Artist with two PENDING IntakeRequests (one per
// spec) so the approve and decline specs never touch the same row. Uses
// raw pg rather than the generated Prisma client: Playwright's globalSetup
// runs outside Next's runtime, same reasoning as the manual verification
// scripts used throughout Phase 3.
export default async function globalSetup() {
  config();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const artistId = randomUUID();
  const approveClientId = randomUUID();
  const declineClientId = randomUUID();
  const approveRequestId = randomUUID();
  const declineRequestId = randomUUID();
  const approveClientHandle = "e2e_client_approve";
  const declineClientHandle = "e2e_client_decline";

  await client.query(
    `INSERT INTO "Artist" (id, name, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, $4, now())`,
    [artistId, "E2E Fixture Artist", "e2e_fixture_artist", "e2e-fixture-artist@example.com"]
  );

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now()), ($4, $5, $6, now())`,
    [
      approveClientId,
      approveClientHandle,
      "e2e-client-approve@example.com",
      declineClientId,
      declineClientHandle,
      "e2e-client-decline@example.com",
    ]
  );

  await client.query(
    `INSERT INTO "IntakeRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], now()),
       ($4, 'PENDING', $5, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], now())`,
    [approveRequestId, approveClientId, artistId, declineRequestId, declineClientId]
  );

  await client.end();

  const fixture: E2eFixture = {
    artistId,
    clientProfileIds: [approveClientId, declineClientId],
    intakeRequestIds: [approveRequestId, declineRequestId],
    approveClientHandle,
    declineClientHandle,
  };

  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
}
