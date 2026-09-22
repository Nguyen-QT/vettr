import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import { config } from "dotenv";
import { Client } from "pg";

// Idempotent local-dev data seed. Uses raw pg rather than the
// generated Prisma client -- this script runs outside Next's runtime
// via tsx, same reasoning as e2e/global-setup.ts's identical choice
// (no "@/" path alias resolution, no Next-specific bootstrapping).
// Mirrors e2e/global-setup.ts's hashPasswordForFixture rather than
// importing src/domains/auth/services/hashPassword for the same
// reason.
//
// Safe to re-run: cleans up accumulated test-suite pollution (vitest's
// unit tests and Playwright's e2e tests both hit this same DATABASE_URL,
// and some cleanup has clearly leaked over time -- see the
// "test_client_%"/"e2e_%" sweep below), then fills in gaps in the real
// dev fixtures (artist@vettr.com / client@vettr.com) without
// clobbering anything already there: weekly hours/tier images/deposit
// settings use "create only if missing", onboarding fields on an
// existing ClientProfile only fill in nulls, and IntakeRequests use
// fixed ids so re-running upserts the same rows instead of duplicating.

function hashPasswordForSeed(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

const DAILY_TIMES = ["11:00", "14:00", "17:30"];
const TIERS = ["TIER_2", "TIER_3", "TIER_4", "FREESTYLE"] as const;

// Known real dev fixtures (CLAUDE.md's manually-provisioned artist/
// client precedent) -- fixed ids so this script's inserts/updates
// target the same rows every run instead of guessing by name.
const VETTR_ARTIST_ID = "68612b5c-0018-414e-8b58-cfecd7f5f1c1";
const LUNA_ARTIST_ID = "7ab962b5-2ebb-4450-a997-df3712b2c7db";
const VETTR_CLIENT_ID = "3f044d02-fbd2-48b2-9e87-fda182113b07";

// New fixture ids, fixed so re-running this script upserts instead of
// duplicating.
const JORDAN_CLIENT_ID = "59884c92-a999-4ed8-a9b3-20bff9bb2940";
const FLAGGED_CLIENT_ID = "caeebfce-4b9d-4070-aae6-03daf8976beb";

const REQUEST_IDS = {
  vettrApprovedFuture: "e8c80531-e57e-4ec7-b486-fe054838ad44",
  vettrApprovedPaid: "2d7f07b7-9f51-4d6d-b93d-8717e54841a2",
  vettrPastDue: "15c35b30-9b38-488d-90df-2841415841d1",
  vettrMaxEndTime: "33992114-cdb4-4816-a668-329e9c5db912",
  lunaPending: "6eaa01eb-fe05-487f-aaa5-620645c2c57a",
  lunaApprovedFuture: "6ffce52b-124c-48ee-9a12-27a06017be03",
  lunaDeclined: "2b8ce658-f2b7-49ac-acbe-86636269012b",
};

const TIME_SLOT_IDS = {
  vettrApprovedFuture: "49cdbf5d-f927-40be-945e-111eb2205292",
  vettrApprovedPaid: "7cd53b74-7187-4fc5-bf38-fa9f014d45b8",
  vettrPastDue: "824a3ea4-cd5d-4290-9b83-3fb3bc736d30",
  lunaApprovedFuture: "3368c1cc-2ba2-47cd-8477-6e46a8124d81",
};

async function main() {
  config();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // --- Cleanup: sweep accumulated test-suite pollution ---------------
  // Both vitest (unit tests, hitting this DB directly via @/lib/prisma)
  // and Playwright (e2e, via global-setup.ts) create throwaway rows
  // prefixed "test_client_"/"e2e_" and clean up in their own
  // afterEach/globalTeardown -- but a run that crashes or gets
  // interrupted before that runs leaves its rows behind permanently
  // (a future run always generates fresh random ids, so it never
  // matches and re-cleans an old orphaned run). These accumulate
  // indefinitely and drown out real seed data. Safe to delete: these
  // prefixes are never used by real app usage.
  const staleClients = await client.query(
    `SELECT id FROM "ClientProfile" WHERE "instagramHandle" LIKE 'test_client_%' OR "instagramHandle" LIKE 'e2e_%'`
  );
  const staleClientIds = staleClients.rows.map((row) => row.id);
  if (staleClientIds.length > 0) {
    await client.query(`DELETE FROM "IntakeRequest" WHERE "clientId" = ANY($1)`, [
      staleClientIds,
    ]);
    await client.query(`DELETE FROM "Account" WHERE "clientProfileId" = ANY($1)`, [
      staleClientIds,
    ]);
    await client.query(`DELETE FROM "ClientProfile" WHERE id = ANY($1)`, [
      staleClientIds,
    ]);
  }
  console.log(`Cleaned up ${staleClientIds.length} stale test ClientProfile rows.`);

  const staleArtists = await client.query(
    `SELECT id FROM "Artist" WHERE "instagramHandle" LIKE 'e2e_%'`
  );
  for (const { id } of staleArtists.rows) {
    await client.query(`DELETE FROM "ArtistWeeklyHours" WHERE "artistId" = $1`, [id]);
    await client.query(`DELETE FROM "ArtistScheduleOverride" WHERE "artistId" = $1`, [
      id,
    ]);
    await client.query(`DELETE FROM "TierReferenceImage" WHERE "artistId" = $1`, [id]);
    await client.query(`DELETE FROM "ArtistDepositSetting" WHERE "artistId" = $1`, [
      id,
    ]);
    await client.query(`DELETE FROM "IntakeRequest" WHERE "artistId" = $1`, [id]);
    await client.query(`DELETE FROM "Account" WHERE "artistId" = $1`, [id]);
    await client.query(`DELETE FROM "Artist" WHERE id = $1`, [id]);
  }
  console.log(`Cleaned up ${staleArtists.rows.length} stale test Artist rows.`);

  // --- Weekly hours: create only if the artist has none at all -------
  for (const artistId of [VETTR_ARTIST_ID, LUNA_ARTIST_ID]) {
    const existing = await client.query(
      `SELECT count(*) FROM "ArtistWeeklyHours" WHERE "artistId" = $1`,
      [artistId]
    );
    if (Number(existing.rows[0].count) > 0) continue;
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      await client.query(
        `INSERT INTO "ArtistWeeklyHours" (id, "artistId", "dayOfWeek", "availableTimes", "updatedAt")
         VALUES ($1, $2, $3, $4, now())`,
        [randomUUID(), artistId, dayOfWeek, DAILY_TIMES]
      );
    }
    console.log(`Seeded 7 days of weekly hours for artist ${artistId}.`);
  }

  // --- Tier reference images: fill in whichever tiers are missing ----
  for (const artistId of [VETTR_ARTIST_ID, LUNA_ARTIST_ID]) {
    const existing = await client.query(
      `SELECT DISTINCT tier FROM "TierReferenceImage" WHERE "artistId" = $1`,
      [artistId]
    );
    const existingTiers = new Set(existing.rows.map((row) => row.tier));
    for (const tier of TIERS) {
      if (existingTiers.has(tier)) continue;
      await client.query(
        `INSERT INTO "TierReferenceImage" (id, "artistId", tier, "imageUrl", "createdAt")
         VALUES ($1, $2, $3, $4, now())`,
        [
          randomUUID(),
          artistId,
          tier,
          `https://utfs.io/f/vettr-dev-${artistId.slice(0, 8)}-${tier.toLowerCase()}.jpg`,
        ]
      );
    }
  }
  console.log("Ensured every tier has a reference image for both real artists.");

  // --- Deposit settings (CLAUDE.md 7.1): upsert -- intentional fresh
  // seed data for a feature that had zero real-artist coverage.
  // Luna deliberately only gets TIER_2/TIER_3 configured, leaving
  // TIER_4/FREESTYLE unset, so both the "deposit required" and "no
  // deposit configured yet" states are visible somewhere in real data.
  const depositSettings: [string, string, number][] = [
    [VETTR_ARTIST_ID, "TIER_2", 20],
    [VETTR_ARTIST_ID, "TIER_3", 35],
    [VETTR_ARTIST_ID, "TIER_4", 50],
    [VETTR_ARTIST_ID, "FREESTYLE", 75],
    [LUNA_ARTIST_ID, "TIER_2", 25],
    [LUNA_ARTIST_ID, "TIER_3", 40],
  ];
  for (const [artistId, tier, amount] of depositSettings) {
    await client.query(
      `INSERT INTO "ArtistDepositSetting" (id, "artistId", tier, "depositAmount", "updatedAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("artistId", tier) DO UPDATE SET "depositAmount" = $4, "updatedAt" = now()`,
      [randomUUID(), artistId, tier, amount]
    );
  }
  console.log(`Seeded ${depositSettings.length} deposit-setting rows.`);

  // --- Client onboarding fields: fill in only currently-null fields --
  // same posture as submitIntakeRequest's own signed-in-client path
  // (CLAUDE.md 6.2) -- never overwrites anything the dev already set.
  await client.query(
    `UPDATE "ClientProfile"
     SET "firstName" = COALESCE("firstName", $2),
         "lastName" = COALESCE("lastName", $3),
         "dateOfBirth" = COALESCE("dateOfBirth", $4),
         phone = COALESCE(phone, $5)
     WHERE id = $1`,
    [VETTR_CLIENT_ID, "Jordan", "Vettr", "1995-06-15", "+447700900001"]
  );

  // Second login-capable client, deliberately WITHOUT onboarding
  // fields set -- covers the "still editable" signed-in case (CLAUDE.md
  // 6.2.2-6.2.4's per-field locking), unlike vettr_dev_client above.
  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO NOTHING`,
    [JORDAN_CLIENT_ID, "jordan_dev_client", "jordan@vettr.com"]
  );
  const jordanPassword = "vettr-dev-password";
  await client.query(
    `INSERT INTO "Account" (id, email, "passwordHash", role, "clientProfileId", "updatedAt")
     VALUES ($1, $2, $3, 'CLIENT', $4, now())
     ON CONFLICT (email) DO NOTHING`,
    [randomUUID(), "jordan@vettr.com", hashPasswordForSeed(jordanPassword), JORDAN_CLIENT_ID]
  );

  // Third client, pre-flagged (CLAUDE.md 5.6/7.4's enforcePrecharge) --
  // no UI reacts to this yet (Phase 7.3/7.4 aren't built), but the data
  // is ready for when it does.
  await client.query(
    `INSERT INTO "ClientProfile"
       (id, "instagramHandle", email, "firstName", "lastName", "dateOfBirth", "cancellationCount", "enforcePrecharge", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (id) DO NOTHING`,
    [
      FLAGGED_CLIENT_ID,
      "flagged_dev_client",
      "flagged@vettr.com",
      "Riley",
      "Flagged",
      "1998-03-20",
      2,
      true,
    ]
  );
  const flaggedPassword = "vettr-dev-password";
  await client.query(
    `INSERT INTO "Account" (id, email, "passwordHash", role, "clientProfileId", "updatedAt")
     VALUES ($1, $2, $3, 'CLIENT', $4, now())
     ON CONFLICT (email) DO NOTHING`,
    [
      randomUUID(),
      "flagged@vettr.com",
      hashPasswordForSeed(flaggedPassword),
      FLAGGED_CLIENT_ID,
    ]
  );
  console.log("Seeded jordan@vettr.com and flagged@vettr.com client accounts.");

  // --- IntakeRequests: fixed ids, upsert-by-id so re-running this
  // script doesn't duplicate rows. Dates anchored relative to today so
  // "future"/"past-due" stay correct whenever this is re-run.
  const now = new Date();
  const futureDate1 = new Date(now.getTime() + 21 * 24 * 60 * 60_000); // ~3 weeks out
  const futureDate2 = new Date(now.getTime() + 28 * 24 * 60 * 60_000);
  const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60_000); // last week

  function atTime(date: Date, hours: number, minutes: number): Date {
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  async function upsertRequest(params: {
    id: string;
    status: string;
    clientId: string;
    artistId: string;
    tier: string;
    minPrice: number;
    maxPrice: number;
    requestedStartTime?: Date;
    depositPaid?: boolean;
    clientMaxEndTime?: Date;
  }) {
    await client.query(
      `INSERT INTO "IntakeRequest"
         (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "depositPaid", "clientMaxEndTime", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY[]::text[], ARRAY[]::text[], $8, $9, $10, now())
       ON CONFLICT (id) DO UPDATE SET
         status = $2, "requestedStartTime" = $8, "depositPaid" = $9, "clientMaxEndTime" = $10, "updatedAt" = now()`,
      [
        params.id,
        params.status,
        params.clientId,
        params.artistId,
        params.tier,
        params.minPrice,
        params.maxPrice,
        params.requestedStartTime ?? null,
        params.depositPaid ?? false,
        params.clientMaxEndTime ?? null,
      ]
    );
  }

  async function upsertTimeSlot(
    id: string,
    artistId: string,
    intakeRequestId: string,
    startTime: Date,
    endTime: Date
  ) {
    await client.query(
      `INSERT INTO "TimeSlot" (id, "startTime", "endTime", status, "artistId", "intakeRequestId", "updatedAt")
       VALUES ($1, $2, $3, 'BOOKED', $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET "startTime" = $2, "endTime" = $3`,
      [id, startTime, endTime, artistId, intakeRequestId]
    );
  }

  // Vettr Dev Artist gains: an unpaid APPROVED future booking (Pay
  // Deposit is testable), an already-paid APPROVED future booking (the
  // contrasting "no button" state), a past-due APPROVED booking (Needs
  // Resolution's real complete/no-show controls), and a PENDING request
  // carrying a clientMaxEndTime (6.3's "Must be finished by" display).
  const vettrApprovedFutureStart = atTime(futureDate1, 11, 0);
  await upsertRequest({
    id: REQUEST_IDS.vettrApprovedFuture,
    status: "APPROVED",
    clientId: VETTR_CLIENT_ID,
    artistId: VETTR_ARTIST_ID,
    tier: "TIER_2",
    minPrice: 50,
    maxPrice: 100,
    requestedStartTime: vettrApprovedFutureStart,
    depositPaid: false,
  });
  await upsertTimeSlot(
    TIME_SLOT_IDS.vettrApprovedFuture,
    VETTR_ARTIST_ID,
    REQUEST_IDS.vettrApprovedFuture,
    vettrApprovedFutureStart,
    atTime(futureDate1, 12, 0)
  );

  const vettrApprovedPaidStart = atTime(futureDate2, 14, 0);
  await upsertRequest({
    id: REQUEST_IDS.vettrApprovedPaid,
    status: "APPROVED",
    clientId: JORDAN_CLIENT_ID,
    artistId: VETTR_ARTIST_ID,
    tier: "TIER_4",
    minPrice: 200,
    maxPrice: 400,
    requestedStartTime: vettrApprovedPaidStart,
    depositPaid: true,
  });
  await upsertTimeSlot(
    TIME_SLOT_IDS.vettrApprovedPaid,
    VETTR_ARTIST_ID,
    REQUEST_IDS.vettrApprovedPaid,
    vettrApprovedPaidStart,
    atTime(futureDate2, 17, 0)
  );

  const vettrPastDueStart = atTime(pastDate, 11, 0);
  await upsertRequest({
    id: REQUEST_IDS.vettrPastDue,
    status: "APPROVED",
    clientId: FLAGGED_CLIENT_ID,
    artistId: VETTR_ARTIST_ID,
    tier: "TIER_3",
    minPrice: 100,
    maxPrice: 200,
    requestedStartTime: vettrPastDueStart,
    depositPaid: true,
  });
  await upsertTimeSlot(
    TIME_SLOT_IDS.vettrPastDue,
    VETTR_ARTIST_ID,
    REQUEST_IDS.vettrPastDue,
    vettrPastDueStart,
    atTime(pastDate, 12, 0)
  );

  await upsertRequest({
    id: REQUEST_IDS.vettrMaxEndTime,
    status: "PENDING",
    clientId: JORDAN_CLIENT_ID,
    artistId: VETTR_ARTIST_ID,
    tier: "TIER_2",
    minPrice: 50,
    maxPrice: 100,
    requestedStartTime: atTime(futureDate1, 14, 0),
    clientMaxEndTime: atTime(futureDate1, 15, 30),
  });

  // Luna Vega had zero bookings at all -- a client browsing/booking
  // with a second artist is otherwise untestable. Reuses
  // VETTR_CLIENT_ID for the PENDING request specifically so the client
  // dashboard's "spans every artist" behavior (getClientBookings,
  // CLAUDE.md 5.2) has a real cross-artist example.
  await upsertRequest({
    id: REQUEST_IDS.lunaPending,
    status: "PENDING",
    clientId: VETTR_CLIENT_ID,
    artistId: LUNA_ARTIST_ID,
    tier: "TIER_3",
    minPrice: 100,
    maxPrice: 200,
    requestedStartTime: atTime(futureDate1, 17, 30),
  });

  const lunaApprovedFutureStart = atTime(futureDate2, 11, 0);
  await upsertRequest({
    id: REQUEST_IDS.lunaApprovedFuture,
    status: "APPROVED",
    clientId: JORDAN_CLIENT_ID,
    artistId: LUNA_ARTIST_ID,
    tier: "TIER_2",
    minPrice: 50,
    maxPrice: 100,
    requestedStartTime: lunaApprovedFutureStart,
    depositPaid: false,
  });
  await upsertTimeSlot(
    TIME_SLOT_IDS.lunaApprovedFuture,
    LUNA_ARTIST_ID,
    REQUEST_IDS.lunaApprovedFuture,
    lunaApprovedFutureStart,
    atTime(futureDate2, 12, 0)
  );

  await upsertRequest({
    id: REQUEST_IDS.lunaDeclined,
    status: "DECLINED",
    clientId: FLAGGED_CLIENT_ID,
    artistId: LUNA_ARTIST_ID,
    tier: "TIER_4",
    minPrice: 200,
    maxPrice: 400,
  });

  console.log(`Seeded ${Object.keys(REQUEST_IDS).length} additional IntakeRequests.`);

  await client.end();
  console.log("\nSeed complete. Login credentials:");
  console.log("  Artist:  artist@vettr.com (existing password)");
  console.log("  Client:  client@vettr.com (existing password)");
  console.log(`  Client:  jordan@vettr.com / ${jordanPassword}`);
  console.log(`  Client:  flagged@vettr.com / ${flaggedPassword}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
