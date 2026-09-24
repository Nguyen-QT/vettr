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
// existing ClientProfile only fill in nulls, and BookingRequests use
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

// Calendar-review-only clients (CLAUDE.md 19.1.4 follow-up) -- no
// Account/login, just visual variety across the varied-per-day
// appointment fixtures below, same posture as e2e/global-setup.ts's
// login-less pastDueFixtures.
const CALENDAR_CLIENT_A_ID = "635263a5-7e74-48da-baf3-c3edf9321583";
const CALENDAR_CLIENT_B_ID = "43545399-807c-49a7-a8f7-7e6e2279caf7";
const CALENDAR_CLIENT_C_ID = "ec3e5e3c-c289-4e0b-b8d3-5015375dd884";

const REQUEST_IDS = {
  vettrApprovedFuture: "e8c80531-e57e-4ec7-b486-fe054838ad44",
  vettrApprovedPaid: "2d7f07b7-9f51-4d6d-b93d-8717e54841a2",
  vettrPastDue: "15c35b30-9b38-488d-90df-2841415841d1",
  vettrMaxEndTime: "33992114-cdb4-4816-a668-329e9c5db912",
  lunaPending: "6eaa01eb-fe05-487f-aaa5-620645c2c57a",
  lunaApprovedFuture: "6ffce52b-124c-48ee-9a12-27a06017be03",
  lunaDeclined: "2b8ce658-f2b7-49ac-acbe-86636269012b",
  // Calendar review: varied per-day counts (CLAUDE.md 19.1.4 follow-up).
  calendarFuture1: "9ad68c99-eeba-45d8-8894-f80a4e26be9b",
  calendarFuture2a: "7a91fbcc-b474-4361-9b9a-4888127a64d7",
  calendarFuture2b: "f14ee6de-130f-42e4-9d99-d27916f6e30b",
  calendarFuture3a: "c7ed5b19-2237-4667-81a6-53ee360689fe",
  calendarFuture3b: "ea18d285-61a6-4a72-a6a3-39759321325f",
  calendarFuture3c: "d0ed5744-57a0-451e-8eaf-b52f15ba87f3",
  calendarPast1: "093a091f-3122-4119-b9a2-eaef291d5a5f",
  calendarPast2a: "7f2392ca-857f-4495-9bac-5eaff3976746",
  calendarPast2b: "33adf63c-e30b-40e5-8a82-c1d2fa2b76c5",
  calendarPast3a: "f651e141-e4fc-495d-96dd-df566770aff5",
  calendarPast3b: "802c0632-bccc-4897-91d7-a43368331a92",
  calendarPast3c: "649e1f0a-d825-4f14-a1a8-3b101ecc8d4d",
  calendarCompleted: "415409a3-d73a-4abd-a222-fe50ca356b22",
  calendarNoShow: "66037adc-f5c4-478b-8e7f-4eb96cc8c5d6",
  calendarCancelledByArtist: "22a183d8-f104-4c04-a229-9acb7cd60287",
  calendarCancelledByClient: "f230b1dc-b13e-48ab-8773-d08ed942b06f",
};

const TIME_SLOT_IDS = {
  vettrApprovedFuture: "49cdbf5d-f927-40be-945e-111eb2205292",
  vettrApprovedPaid: "7cd53b74-7187-4fc5-bf38-fa9f014d45b8",
  vettrPastDue: "824a3ea4-cd5d-4290-9b83-3fb3bc736d30",
  lunaApprovedFuture: "3368c1cc-2ba2-47cd-8477-6e46a8124d81",
  calendarFuture1: "fe0231e3-70a0-4f4c-8694-5787dab6af21",
  calendarFuture2a: "36c0f023-6efd-4d51-b161-77347c246801",
  calendarFuture2b: "a5696681-b53c-4efa-976d-dd3be306e5fb",
  calendarFuture3a: "213e5da5-f8b1-426e-aa6e-ce20276ff21f",
  calendarFuture3b: "c21a9149-a7e3-4f61-a382-34672e105892",
  calendarFuture3c: "2bbccb72-a4fc-4ed9-b22a-524ca2fa9008",
  calendarPast1: "8a3841a2-ae04-4c49-9de5-295b7164a347",
  calendarPast2a: "3fbf1873-15ba-4554-a1d7-1c0afaa8a467",
  calendarPast2b: "82bbbd64-0d06-4962-bdaf-99722f5c6e96",
  calendarPast3a: "1de04753-3047-4eba-8313-c68800eea18e",
  calendarPast3b: "c127176a-91d3-473b-9e9e-9e59f38c0b68",
  calendarPast3c: "1f426fb5-c2ed-4d72-9ba9-989cc5d13f0f",
  calendarCompleted: "f622c8a0-7f0c-494f-ac3f-a75fccf04ed1",
  calendarNoShow: "7e7bc7e7-ae41-4a5e-b990-a0750cdabb7a",
  calendarCancelledByArtist: "59aa1967-a010-4199-b992-6371fb8569c2",
  calendarCancelledByClient: "d4826262-96c7-4f09-8a88-1ee85750e90b",
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
    await client.query(`DELETE FROM "BookingRequest" WHERE "clientId" = ANY($1)`, [
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
    await client.query(`DELETE FROM "BookingRequest" WHERE "artistId" = $1`, [id]);
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
  // same posture as submitBookingRequest's own signed-in-client path
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

  // Calendar-review clients: no Account/login, just visual variety
  // across the varied-per-day appointment fixtures below.
  const calendarReviewClients: Array<{ id: string; handle: string; email: string }> = [
    { id: CALENDAR_CLIENT_A_ID, handle: "calendar_dev_client_a", email: "calendar-a@vettr.com" },
    { id: CALENDAR_CLIENT_B_ID, handle: "calendar_dev_client_b", email: "calendar-b@vettr.com" },
    { id: CALENDAR_CLIENT_C_ID, handle: "calendar_dev_client_c", email: "calendar-c@vettr.com" },
  ];
  for (const { id, handle, email } of calendarReviewClients) {
    await client.query(
      `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO NOTHING`,
      [id, handle, email]
    );
  }
  console.log(`Seeded ${calendarReviewClients.length} lightweight client profiles for calendar-review variety.`);

  // --- BookingRequests: fixed ids, upsert-by-id so re-running this
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
    // Mandatory on every APPROVED-and-beyond request via the real
    // reviewBookingRequest flow (CLAUDE.md 4.4) -- omitting these here
    // for an APPROVED fixture would seed data the app itself can never
    // actually produce (CLAUDE.md 18.2).
    estimatedPrice?: number;
    // Only meaningful alongside depositPaid: true -- the real
    // confirmDepositPayment flow (CLAUDE.md 7.1.4) always sets these
    // together.
    depositAmount?: number;
    stripePaymentIntentId?: string;
  }) {
    await client.query(
      `INSERT INTO "BookingRequest"
         (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "depositPaid", "clientMaxEndTime", "estimatedPrice", "depositAmount", "stripePaymentIntentId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, ARRAY[]::text[], ARRAY[]::text[], $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (id) DO UPDATE SET
         status = $2, "requestedStartTime" = $8, "depositPaid" = $9, "clientMaxEndTime" = $10, "estimatedPrice" = $11, "depositAmount" = $12, "stripePaymentIntentId" = $13, "updatedAt" = now()`,
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
        params.estimatedPrice ?? null,
        params.depositAmount ?? null,
        params.stripePaymentIntentId ?? null,
      ]
    );
  }

  async function upsertTimeSlot(
    id: string,
    artistId: string,
    bookingRequestId: string,
    startTime: Date,
    endTime: Date,
    // Defaults to "BOOKED", matching every pre-existing call site.
    // "RELEASED" is for a resolved-cancellation fixture, mirroring
    // what cancelApprovedBookingAsArtist's real releaseBookedTimeSlots
    // call leaves behind (CLAUDE.md 7.2.1/7.2.2).
    status: "BOOKED" | "RELEASED" = "BOOKED"
  ) {
    await client.query(
      `INSERT INTO "TimeSlot" (id, "startTime", "endTime", status, "artistId", "bookingRequestId", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET "startTime" = $2, "endTime" = $3, status = $4`,
      [id, startTime, endTime, status, artistId, bookingRequestId]
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
    estimatedPrice: 75,
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
    estimatedPrice: 300,
    depositAmount: 50,
    stripePaymentIntentId: "pi_seed_vettr_approved_paid",
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
    estimatedPrice: 150,
    depositAmount: 35,
    stripePaymentIntentId: "pi_seed_vettr_past_due",
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
    estimatedPrice: 75,
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

  // --- Calendar review: varied per-day appointment counts (0/1/2/3) --
  // CLAUDE.md 19.1.4 follow-up. DAILY_TIMES only has 3 fixed slots per
  // artist per day, and TimeSlot's DB-level exclusion constraint only
  // allows one BOOKED slot per overlapping range per artist -- so N<=3
  // per day isn't an arbitrary choice, it's the schema's actual max
  // for single-slot appointments. A day with fewer than 3 just uses
  // fewer of the 3 daily times; a day with 0 simply has no fixture
  // here at all. All on VETTR_ARTIST_ID, the artist the dev logs into.
  const calendarBookings: Array<{
    requestKey: keyof typeof REQUEST_IDS;
    slotKey: keyof typeof TIME_SLOT_IDS;
    dayOffset: number;
    hours: number;
    minutes: number;
    clientId: string;
    tier: string;
    minPrice: number;
    maxPrice: number;
    estimatedPrice: number;
  }> = [
    // Future (upcoming): +3 days = 1 appointment, +6 days = 2, +9 days = 3.
    {
      requestKey: "calendarFuture1",
      slotKey: "calendarFuture1",
      dayOffset: 3,
      hours: 11,
      minutes: 0,
      clientId: CALENDAR_CLIENT_A_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 75,
    },
    {
      requestKey: "calendarFuture2a",
      slotKey: "calendarFuture2a",
      dayOffset: 6,
      hours: 11,
      minutes: 0,
      clientId: CALENDAR_CLIENT_B_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 80,
    },
    {
      requestKey: "calendarFuture2b",
      slotKey: "calendarFuture2b",
      dayOffset: 6,
      hours: 14,
      minutes: 0,
      clientId: CALENDAR_CLIENT_C_ID,
      tier: "TIER_3",
      minPrice: 100,
      maxPrice: 200,
      estimatedPrice: 150,
    },
    {
      requestKey: "calendarFuture3a",
      slotKey: "calendarFuture3a",
      dayOffset: 9,
      hours: 11,
      minutes: 0,
      clientId: JORDAN_CLIENT_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 70,
    },
    {
      requestKey: "calendarFuture3b",
      slotKey: "calendarFuture3b",
      dayOffset: 9,
      hours: 14,
      minutes: 0,
      clientId: CALENDAR_CLIENT_A_ID,
      tier: "TIER_3",
      minPrice: 100,
      maxPrice: 200,
      estimatedPrice: 160,
    },
    {
      requestKey: "calendarFuture3c",
      slotKey: "calendarFuture3c",
      dayOffset: 9,
      hours: 17,
      minutes: 30,
      clientId: CALENDAR_CLIENT_B_ID,
      tier: "TIER_4",
      minPrice: 200,
      maxPrice: 400,
      estimatedPrice: 250,
    },
    // Past-due, still APPROVED/unresolved (shows under the artist's
    // Needs Resolution panel): -3 days = 1, -6 days = 2, -9 days = 3.
    {
      requestKey: "calendarPast1",
      slotKey: "calendarPast1",
      dayOffset: -3,
      hours: 11,
      minutes: 0,
      clientId: CALENDAR_CLIENT_C_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 65,
    },
    {
      requestKey: "calendarPast2a",
      slotKey: "calendarPast2a",
      dayOffset: -6,
      hours: 11,
      minutes: 0,
      clientId: CALENDAR_CLIENT_A_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 75,
    },
    {
      requestKey: "calendarPast2b",
      slotKey: "calendarPast2b",
      dayOffset: -6,
      hours: 14,
      minutes: 0,
      clientId: JORDAN_CLIENT_ID,
      tier: "TIER_3",
      minPrice: 100,
      maxPrice: 200,
      estimatedPrice: 140,
    },
    {
      requestKey: "calendarPast3a",
      slotKey: "calendarPast3a",
      dayOffset: -9,
      hours: 11,
      minutes: 0,
      clientId: CALENDAR_CLIENT_B_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      estimatedPrice: 60,
    },
    {
      requestKey: "calendarPast3b",
      slotKey: "calendarPast3b",
      dayOffset: -9,
      hours: 14,
      minutes: 0,
      clientId: CALENDAR_CLIENT_C_ID,
      tier: "TIER_3",
      minPrice: 100,
      maxPrice: 200,
      estimatedPrice: 130,
    },
    {
      requestKey: "calendarPast3c",
      slotKey: "calendarPast3c",
      dayOffset: -9,
      hours: 17,
      minutes: 30,
      clientId: FLAGGED_CLIENT_ID,
      tier: "TIER_4",
      minPrice: 200,
      maxPrice: 400,
      estimatedPrice: 280,
    },
  ];

  for (const booking of calendarBookings) {
    const day = new Date(now.getTime() + booking.dayOffset * 24 * 60 * 60_000);
    const startTime = atTime(day, booking.hours, booking.minutes);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    await upsertRequest({
      id: REQUEST_IDS[booking.requestKey],
      status: "APPROVED",
      clientId: booking.clientId,
      artistId: VETTR_ARTIST_ID,
      tier: booking.tier,
      minPrice: booking.minPrice,
      maxPrice: booking.maxPrice,
      requestedStartTime: startTime,
      estimatedPrice: booking.estimatedPrice,
    });
    await upsertTimeSlot(
      TIME_SLOT_IDS[booking.slotKey],
      VETTR_ARTIST_ID,
      REQUEST_IDS[booking.requestKey],
      startTime,
      endTime
    );
  }
  console.log(
    `Seeded ${calendarBookings.length} calendar-review BookingRequests across varied per-day counts (future + past-due).`
  );

  // --- Calendar review: resolved-state fixtures (COMPLETED/NO_SHOW/
  // CANCELLED_BY_ARTIST/CANCELLED_BY_CLIENT) -- NOTE these will NOT
  // appear on the artist's calendar: getUpcomingAppointments and
  // getPastDueAppointments both filter to status: "APPROVED" only, so
  // a resolved request is invisible to either read regardless of its
  // TimeSlot. Seeded anyway for DB realism and other views that do
  // show full history (e.g. getClientBookings, CLAUDE.md 5.2).
  // COMPLETED/NO_SHOW keep their TimeSlot BOOKED, matching the real
  // markAppointmentCompleted/markAppointmentNoShow invariant that
  // neither releases it; the two CANCELLED_BY_* fixtures use RELEASED,
  // matching cancelApprovedBookingAsArtist's real releaseBookedTimeSlots
  // call.
  const calendarResolvedFixtures: Array<{
    requestKey: keyof typeof REQUEST_IDS;
    slotKey: keyof typeof TIME_SLOT_IDS;
    dayOffset: number;
    status: string;
    timeSlotStatus: "BOOKED" | "RELEASED";
    clientId: string;
  }> = [
    {
      requestKey: "calendarCompleted",
      slotKey: "calendarCompleted",
      dayOffset: -12,
      status: "COMPLETED",
      timeSlotStatus: "BOOKED",
      clientId: CALENDAR_CLIENT_A_ID,
    },
    {
      requestKey: "calendarNoShow",
      slotKey: "calendarNoShow",
      dayOffset: -14,
      status: "NO_SHOW",
      timeSlotStatus: "BOOKED",
      clientId: CALENDAR_CLIENT_B_ID,
    },
    {
      requestKey: "calendarCancelledByArtist",
      slotKey: "calendarCancelledByArtist",
      dayOffset: -16,
      status: "CANCELLED_BY_ARTIST",
      timeSlotStatus: "RELEASED",
      clientId: CALENDAR_CLIENT_C_ID,
    },
    {
      requestKey: "calendarCancelledByClient",
      slotKey: "calendarCancelledByClient",
      dayOffset: -18,
      status: "CANCELLED_BY_CLIENT",
      timeSlotStatus: "RELEASED",
      clientId: JORDAN_CLIENT_ID,
    },
  ];

  for (const fixture of calendarResolvedFixtures) {
    const day = new Date(now.getTime() + fixture.dayOffset * 24 * 60 * 60_000);
    const startTime = atTime(day, 11, 0);
    const endTime = new Date(startTime.getTime() + 60 * 60_000);
    await upsertRequest({
      id: REQUEST_IDS[fixture.requestKey],
      status: fixture.status,
      clientId: fixture.clientId,
      artistId: VETTR_ARTIST_ID,
      tier: "TIER_2",
      minPrice: 50,
      maxPrice: 100,
      requestedStartTime: startTime,
      estimatedPrice: 75,
    });
    await upsertTimeSlot(
      TIME_SLOT_IDS[fixture.slotKey],
      VETTR_ARTIST_ID,
      REQUEST_IDS[fixture.requestKey],
      startTime,
      endTime,
      fixture.timeSlotStatus
    );
  }
  console.log(
    `Seeded ${calendarResolvedFixtures.length} resolved-state BookingRequests (won't appear on the calendar -- see comment above).`
  );

  console.log(`Seeded ${Object.keys(REQUEST_IDS).length} additional BookingRequests.`);

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
