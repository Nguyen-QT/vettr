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
  awaitingConfirmationClientHandle: string;
}

// Seeds one throwaway Artist with three IntakeRequests -- two PENDING
// (one per approve/decline spec) and one already AWAITING_SLOT_CONFIRMATION
// (for the confirm-booking spec) -- so no spec ever touches another's row.
// Uses raw pg rather than the generated Prisma client: Playwright's
// globalSetup runs outside Next's runtime, same reasoning as the manual
// verification scripts used throughout Phase 3.
export default async function globalSetup() {
  config();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const artistId = randomUUID();
  const approveClientId = randomUUID();
  const declineClientId = randomUUID();
  const awaitingConfirmationClientId = randomUUID();
  const approveRequestId = randomUUID();
  const declineRequestId = randomUUID();
  const awaitingConfirmationRequestId = randomUUID();
  const approveClientHandle = "e2e_client_approve";
  const declineClientHandle = "e2e_client_decline";
  const awaitingConfirmationClientHandle = "e2e_client_awaiting";

  await client.query(
    `INSERT INTO "Artist" (id, name, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, $4, now())`,
    [artistId, "E2E Fixture Artist", "e2e_fixture_artist", "e2e-fixture-artist@example.com"]
  );

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now()), ($4, $5, $6, now()), ($7, $8, $9, now())`,
    [
      approveClientId,
      approveClientHandle,
      "e2e-client-approve@example.com",
      declineClientId,
      declineClientHandle,
      "e2e-client-decline@example.com",
      awaitingConfirmationClientId,
      awaitingConfirmationClientHandle,
      "e2e-client-awaiting@example.com",
    ]
  );

  // requestedStartTime is required for reviewIntakeRequest (4.1f) to book
  // a slot on approve -- far enough in the future to never be "in the
  // past" for the lifetime of a test run.
  const requestedStartTime = new Date("2099-01-01T11:00:00.000Z");
  const awaitingConfirmationStartTime = new Date("2099-01-02T11:00:00.000Z");

  await client.query(
    `INSERT INTO "IntakeRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $6, now()),
       ($4, 'PENDING', $5, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $6, now())`,
    [
      approveRequestId,
      approveClientId,
      artistId,
      declineRequestId,
      declineClientId,
      requestedStartTime,
    ]
  );

  // Already AWAITING_SLOT_CONFIRMATION with a stored proposal, as if
  // reviewIntakeRequest had already run with a duration spilling into a
  // second slot -- the confirm-booking spec starts from this state
  // directly rather than re-deriving it through the review step.
  await client.query(
    `INSERT INTO "IntakeRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "proposedDurationMinutes", "updatedAt")
     VALUES
       ($1, 'AWAITING_SLOT_CONFIRMATION', $2, $3, 'FREESTYLE', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, 300, now())`,
    [
      awaitingConfirmationRequestId,
      awaitingConfirmationClientId,
      artistId,
      awaitingConfirmationStartTime,
    ]
  );

  await client.end();

  const fixture: E2eFixture = {
    artistId,
    clientProfileIds: [approveClientId, declineClientId, awaitingConfirmationClientId],
    intakeRequestIds: [approveRequestId, declineRequestId, awaitingConfirmationRequestId],
    approveClientHandle,
    declineClientHandle,
    awaitingConfirmationClientHandle,
  };

  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
}
