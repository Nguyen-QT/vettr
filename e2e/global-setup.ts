import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { config } from "dotenv";
import { Client } from "pg";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

// Mirrors src/domains/auth/services/hashPassword.ts's "saltHex:hashHex"
// format and params, duplicated rather than imported -- globalSetup
// runs outside Next's runtime, same reasoning as the raw pg usage
// below rather than the generated Prisma client.
function hashPasswordForFixture(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export interface E2eFixture {
  artistId: string;
  clientProfileIds: string[];
  bookingRequestIds: string[];
  approveClientHandle: string;
  declineClientHandle: string;
  awaitingConfirmationClientHandle: string;
  freestylePendingClientHandle: string;
  bookedSlotClientHandle: string;
  // A separate APPROVED booking dedicated to the reschedule spec
  // (5.5.4), untouched by any other spec.
  rescheduleTestClientHandle: string;
  // Known date/time already BOOKED for this artist (4.1.10.4), so a spec
  // can pick this date and assert that exact time renders disabled.
  bookedSlotDate: string;
  bookedSlotTime: string;
  // Real credentials for the artist login spec (5.1.5) to exercise the
  // actual loginArtist check against.
  artistLoginEmail: string;
  artistLoginPassword: string;
  // A separately pre-created, already-valid Session id (not tied to a
  // real login) -- specs that aren't testing login itself set this
  // directly as the session cookie via page.context().addCookies, so
  // they don't all have to re-drive the login UI just to reach a
  // protected route.
  authenticatedSessionId: string;
  // Three separate past-due APPROVED bookings (CLAUDE.md 5.6.5), one
  // per lifecycle action, so the no-show/complete specs never touch the
  // same row; a third stays untouched for the "no Cancel control" spec.
  pastDueNoShowClientHandle: string;
  pastDueCompleteClientHandle: string;
  pastDueUntouchedClientHandle: string;
  // A dedicated upcoming APPROVED booking for the cancel-from-the-
  // upcoming-list spec (5.6.5).
  cancelUpcomingClientHandle: string;
  // Real credentials for a pre-provisioned client Account (CLAUDE.md
  // 5.2.4), mirroring artistLoginEmail/Password above -- this
  // ClientProfile has its own booking so the login spec can assert the
  // dashboard shows it.
  clientLoginEmail: string;
  clientLoginPassword: string;
  // An existing ClientProfile's email with no Account linked yet, for
  // the signup spec to exercise the real signupClient check against --
  // reuses freestylePendingClientId, which nothing else ever links an
  // Account to.
  clientSignupEmail: string;
  // A second login-capable client (CLAUDE.md 6.2) whose onboarding
  // fields are already set, for the "locked fields" spec.
  onboardedClientEmail: string;
  onboardedClientPassword: string;
  // A dedicated PENDING request carrying a clientMaxEndTime (CLAUDE.md
  // 6.3), never touched by any mutating spec.
  maxEndTimeClientHandle: string;
}

// Seeds one throwaway Artist with three BookingRequests -- two PENDING
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
  const freestylePendingClientId = randomUUID();
  const bookedSlotClientId = randomUUID();
  const approveRequestId = randomUUID();
  const declineRequestId = randomUUID();
  const awaitingConfirmationRequestId = randomUUID();
  const freestylePendingRequestId = randomUUID();
  const bookedSlotRequestId = randomUUID();
  const bookedSlotTimeSlotId = randomUUID();
  const rescheduleTestClientId = randomUUID();
  const rescheduleTestRequestId = randomUUID();
  const rescheduleTestTimeSlotId = randomUUID();
  const rescheduleTestClientHandle = "e2e_client_reschedule";
  const clientLoginProfileId = randomUUID();
  const clientLoginRequestId = randomUUID();
  const clientEditableRequestId = randomUUID();
  // A third booking for the same login-capable client (CLAUDE.md 7.1.9)
  // -- APPROVED, unpaid, TIER_4 so it never overlaps the TIER_2/TIER_3
  // bookings the cancel/edit specs already touch on this same profile.
  const depositRequestId = randomUUID();
  const maxEndTimeClientId = randomUUID();
  const maxEndTimeRequestId = randomUUID();
  const maxEndTimeClientHandle = "e2e_client_maxendtime";
  const approveClientHandle = "e2e_client_approve";
  const declineClientHandle = "e2e_client_decline";
  const awaitingConfirmationClientHandle = "e2e_client_awaiting";
  const freestylePendingClientHandle = "e2e_client_freestyle";
  const bookedSlotClientHandle = "e2e_client_booked";
  const bookedSlotDate = "2099-06-15";
  const bookedSlotTime = "11:00";

  await client.query(
    `INSERT INTO "Artist" (id, name, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, $4, now())`,
    [artistId, "E2E Fixture Artist", "e2e_fixture_artist", "e2e-fixture-artist@example.com"]
  );

  // Only TIER_2 has an example image -- lets a spec confirm the gallery
  // shows for the form's default tier and stays empty for a tier with
  // nothing configured (CLAUDE.md 4.6).
  await client.query(
    `INSERT INTO "TierReferenceImage" (id, "artistId", tier, "imageUrl", "createdAt")
     VALUES ($1, $2, 'TIER_2', $3, now())`,
    [randomUUID(), artistId, "https://utfs.io/f/e2e-fixture-tier2-reference.jpg"]
  );

  // Only TIER_4 has a configured deposit amount (CLAUDE.md 7.1.9) --
  // lets a spec confirm the "Pay deposit" card shows for the one
  // eligible booking and stays absent for every other tier's APPROVED
  // bookings on this same artist.
  await client.query(
    `INSERT INTO "ArtistDepositSetting" (id, "artistId", tier, "depositAmount", "updatedAt")
     VALUES ($1, $2, 'TIER_4', 40, now())`,
    [randomUUID(), artistId]
  );

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now()), ($4, $5, $6, now()), ($7, $8, $9, now()), ($10, $11, $12, now()), ($13, $14, $15, now())`,
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
      bookedSlotClientId,
      bookedSlotClientHandle,
      "e2e-client-booked@example.com",
      freestylePendingClientId,
      freestylePendingClientHandle,
      "e2e-client-freestyle@example.com",
    ]
  );

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now())`,
    [
      rescheduleTestClientId,
      rescheduleTestClientHandle,
      "e2e-client-reschedule@example.com",
    ]
  );

  // requestedStartTime is required for reviewBookingRequest (4.1f) to book
  // a slot on approve -- far enough in the future to never be "in the
  // past" for the lifetime of a test run.
  const requestedStartTime = new Date("2099-01-01T11:00:00.000Z");
  const awaitingConfirmationStartTime = new Date("2099-01-02T11:00:00.000Z");

  // Non-empty designTags/clientNotes here (unlike the other fixture
  // requests below) so the dashboard spec/manual UI Mode review can
  // actually see the tags/notes/image rendering paths, not just the
  // fields that happen to always be present (handle/email/budget).
  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "clientNotes", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_2', 100, 200, ARRAY['fine-line-detail']::text[], ARRAY[]::text[], 'Prefers weekday afternoons.', $6, now()),
       ($4, 'PENDING', $5, $3, 'TIER_2', 100, 200, ARRAY['geometric-pattern']::text[], ARRAY[]::text[], 'Open to size adjustments.', $6, now())`,
    [
      approveRequestId,
      approveClientId,
      artistId,
      declineRequestId,
      declineClientId,
      requestedStartTime,
    ]
  );

  // Fake but well-formed UploadThing-style URLs -- next.config.ts's
  // remotePatterns allow the host so <Image> won't error, even though
  // the file itself 404s (fine for checking the layout renders).
  await client.query(
    `INSERT INTO "DesignReference" (id, "imageUrl", "bookingRequestId", "createdAt")
     VALUES
       ($1, $2, $3, now()),
       ($4, $5, $6, now())`,
    [
      randomUUID(),
      "https://utfs.io/f/e2e-fixture-approve-reference.jpg",
      approveRequestId,
      randomUUID(),
      "https://utfs.io/f/e2e-fixture-decline-reference.jpg",
      declineRequestId,
    ]
  );

  // A dedicated PENDING request carrying a clientMaxEndTime (CLAUDE.md
  // 6.3), purely for the artist-dashboard display spec -- never
  // touched by any mutating spec (unlike approveRequestId/
  // declineRequestId above), so its status/fields stay stable
  // regardless of test run order.
  const maxEndTimeStartTime = new Date("2099-01-04T11:00:00.000Z");
  const maxEndTimeClientMaxEndTime = new Date("2099-01-04T14:30:00.000Z");

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now())`,
    [maxEndTimeClientId, maxEndTimeClientHandle, "e2e-client-maxendtime@example.com"]
  );
  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "clientMaxEndTime", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, $5, now())`,
    [
      maxEndTimeRequestId,
      maxEndTimeClientId,
      artistId,
      maxEndTimeStartTime,
      maxEndTimeClientMaxEndTime,
    ]
  );

  // A separate PENDING FREESTYLE request (the awaiting-confirmation one
  // below is FREESTYLE too, but never renders the duration/price form --
  // it's already past that step) so a spec can assert the estimated
  // price input defaults sensibly for FREESTYLE on the review form.
  const freestylePendingStartTime = new Date("2099-01-03T11:00:00.000Z");

  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'FREESTYLE', 50, 500, ARRAY[]::text[], ARRAY['watercolor-blend']::text[], $4, now())`,
    [
      freestylePendingRequestId,
      freestylePendingClientId,
      artistId,
      freestylePendingStartTime,
    ]
  );

  // Already AWAITING_SLOT_CONFIRMATION with a stored proposal, as if
  // reviewBookingRequest had already run with a duration spilling into a
  // second slot -- the confirm-booking spec starts from this state
  // directly rather than re-deriving it through the review step.
  await client.query(
    `INSERT INTO "BookingRequest"
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

  // Already APPROVED with a real BOOKED TimeSlot (4.1.10.4), so the
  // client-booking-form spec can pick this exact date and assert that
  // time renders disabled/unavailable.
  const bookedSlotStartTime = new Date(`${bookedSlotDate}T${bookedSlotTime}:00.000Z`);
  const bookedSlotEndTime = new Date(bookedSlotStartTime.getTime() + 60 * 60_000);

  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'APPROVED', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, now())`,
    [bookedSlotRequestId, bookedSlotClientId, artistId, bookedSlotStartTime]
  );

  await client.query(
    `INSERT INTO "TimeSlot"
       (id, "startTime", "endTime", status, "artistId", "bookingRequestId", "updatedAt")
     VALUES
       ($1, $2, $3, 'BOOKED', $4, $5, now())`,
    [
      bookedSlotTimeSlotId,
      bookedSlotStartTime,
      bookedSlotEndTime,
      artistId,
      bookedSlotRequestId,
    ]
  );

  // A dedicated APPROVED booking for the reschedule spec (CLAUDE.md
  // 5.5.4), separate from bookedSlotRequestId above -- that fixture's
  // exact date/time is asserted on by client-booking-form.spec.ts, so
  // rescheduling it would break that spec.
  const rescheduleTestStartTime = new Date("2099-07-01T11:00:00");
  const rescheduleTestEndTime = new Date(
    rescheduleTestStartTime.getTime() + 60 * 60_000
  );

  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'APPROVED', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, now())`,
    [
      rescheduleTestRequestId,
      rescheduleTestClientId,
      artistId,
      rescheduleTestStartTime,
    ]
  );

  await client.query(
    `INSERT INTO "TimeSlot"
       (id, "startTime", "endTime", status, "artistId", "bookingRequestId", "updatedAt")
     VALUES
       ($1, $2, $3, 'BOOKED', $4, $5, now())`,
    [
      rescheduleTestTimeSlotId,
      rescheduleTestStartTime,
      rescheduleTestEndTime,
      artistId,
      rescheduleTestRequestId,
    ]
  );

  // Three separate past-due APPROVED bookings (CLAUDE.md 5.6.5) -- one
  // per lifecycle action (no-show/complete), plus a third left
  // untouched purely so a spec can assert Cancel is never offered here
  // (see AppointmentLifecycleActions) without racing the mutating
  // no-show/complete specs over the same row. Each on its own
  // client/request/slot (and a distinct time, so their BOOKED TimeSlots
  // don't collide with the overlap-exclusion constraint).
  const pastDueNoShowClientHandle = "e2e_client_pastdue_noshow";
  const pastDueCompleteClientHandle = "e2e_client_pastdue_complete";
  const pastDueUntouchedClientHandle = "e2e_client_pastdue_untouched";
  const pastDueFixtures = [
    {
      handle: pastDueNoShowClientHandle,
      email: "e2e-client-pastdue-noshow@example.com",
      startTime: new Date("2020-01-02T11:00:00"),
    },
    {
      handle: pastDueCompleteClientHandle,
      email: "e2e-client-pastdue-complete@example.com",
      startTime: new Date("2020-01-03T11:00:00"),
    },
    {
      handle: pastDueUntouchedClientHandle,
      email: "e2e-client-pastdue-untouched@example.com",
      startTime: new Date("2020-01-04T11:00:00"),
    },
  ];
  const pastDueClientIds: string[] = [];
  const pastDueRequestIds: string[] = [];

  for (const { handle, email, startTime } of pastDueFixtures) {
    const pastDueClientId = randomUUID();
    const pastDueRequestId = randomUUID();
    const pastDueEndTime = new Date(startTime.getTime() + 60 * 60_000);
    pastDueClientIds.push(pastDueClientId);
    pastDueRequestIds.push(pastDueRequestId);

    await client.query(
      `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
       VALUES ($1, $2, $3, now())`,
      [pastDueClientId, handle, email]
    );
    await client.query(
      `INSERT INTO "BookingRequest"
         (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
       VALUES
         ($1, 'APPROVED', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, now())`,
      [pastDueRequestId, pastDueClientId, artistId, startTime]
    );
    await client.query(
      `INSERT INTO "TimeSlot"
         (id, "startTime", "endTime", status, "artistId", "bookingRequestId", "updatedAt")
       VALUES
         ($1, $2, $3, 'BOOKED', $4, $5, now())`,
      [randomUUID(), startTime, pastDueEndTime, artistId, pastDueRequestId]
    );
  }

  // A dedicated APPROVED booking for the upcoming-list cancel spec
  // (CLAUDE.md 5.6.5), separate from rescheduleTestRequestId/
  // bookedSlotRequestId above -- cancelling it must not affect either
  // of those specs.
  const cancelUpcomingClientId = randomUUID();
  const cancelUpcomingRequestId = randomUUID();
  const cancelUpcomingClientHandle = "e2e_client_cancel_upcoming";
  const cancelUpcomingStartTime = new Date("2099-08-01T11:00:00");
  const cancelUpcomingEndTime = new Date(
    cancelUpcomingStartTime.getTime() + 60 * 60_000
  );

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now())`,
    [
      cancelUpcomingClientId,
      cancelUpcomingClientHandle,
      "e2e-client-cancel-upcoming@example.com",
    ]
  );
  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'APPROVED', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], $4, now())`,
    [cancelUpcomingRequestId, cancelUpcomingClientId, artistId, cancelUpcomingStartTime]
  );
  await client.query(
    `INSERT INTO "TimeSlot"
       (id, "startTime", "endTime", status, "artistId", "bookingRequestId", "updatedAt")
     VALUES
       ($1, $2, $3, 'BOOKED', $4, $5, now())`,
    [
      randomUUID(),
      cancelUpcomingStartTime,
      cancelUpcomingEndTime,
      artistId,
      cancelUpcomingRequestId,
    ]
  );

  // Account/Session fixtures for route-protection specs (CLAUDE.md
  // 5.1.4/5.1.5) -- one real login-capable Account for this artist,
  // plus a second already-valid Session so other specs can skip the
  // login UI and jump straight to a protected route.
  const artistAccountId = randomUUID();
  const artistLoginEmail = "e2e-artist-login@example.com";
  const artistLoginPassword = "e2e-test-password-123";
  const authenticatedSessionId = randomUUID();
  const sessionExpiresAt = new Date("2099-01-01T00:00:00.000Z");

  await client.query(
    `INSERT INTO "Account" (id, email, "passwordHash", role, "artistId", "updatedAt")
     VALUES ($1, $2, $3, 'ARTIST', $4, now())`,
    [
      artistAccountId,
      artistLoginEmail,
      hashPasswordForFixture(artistLoginPassword),
      artistId,
    ]
  );

  await client.query(
    `INSERT INTO "Session" (id, "expiresAt", "accountId")
     VALUES ($1, $2, $3)`,
    [authenticatedSessionId, sessionExpiresAt, artistAccountId]
  );

  // A dedicated ClientProfile + Account for the client login spec
  // (5.2.4), with its own booking so the dashboard has something to
  // show once logged in.
  const clientLoginEmail = "e2e-client-login@example.com";
  const clientLoginPassword = "e2e-test-password-123";
  const clientSignupEmail = "e2e-client-freestyle@example.com";

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "updatedAt")
     VALUES ($1, $2, $3, now())`,
    [clientLoginProfileId, "e2e_client_login", clientLoginEmail]
  );

  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_2', 100, 200, ARRAY[]::text[], ARRAY[]::text[], now())`,
    [clientLoginRequestId, clientLoginProfileId, artistId]
  );

  // A second, separate PENDING booking for the same client (CLAUDE.md
  // 5.4.4), distinguished by tier so the cancel and edit e2e specs
  // never touch the same row.
  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "requestedStartTime", "updatedAt")
     VALUES
       ($1, 'PENDING', $2, $3, 'TIER_3', 150, 300, ARRAY[]::text[], ARRAY[]::text[], $4, now())`,
    [
      clientEditableRequestId,
      clientLoginProfileId,
      artistId,
      new Date("2099-09-01T11:00:00"),
    ]
  );

  // A third booking for the same client, APPROVED/TIER_4/unpaid, so the
  // deposit payment spec (CLAUDE.md 7.1.9) can log in as the same
  // already-provisioned clientLoginEmail account rather than needing
  // its own Account/Session.
  await client.query(
    `INSERT INTO "BookingRequest"
       (id, status, "clientId", "artistId", tier, "minPrice", "maxPrice", "designTags", "aestheticTags", "updatedAt")
     VALUES
       ($1, 'APPROVED', $2, $3, 'TIER_4', 200, 400, ARRAY[]::text[], ARRAY[]::text[], now())`,
    [depositRequestId, clientLoginProfileId, artistId]
  );

  await client.query(
    `INSERT INTO "Account" (id, email, "passwordHash", role, "clientProfileId", "updatedAt")
     VALUES ($1, $2, $3, 'CLIENT', $4, now())`,
    [
      randomUUID(),
      clientLoginEmail,
      hashPasswordForFixture(clientLoginPassword),
      clientLoginProfileId,
    ]
  );

  // A separate login-capable ClientProfile that already has its
  // onboarding fields set (CLAUDE.md 6.2), for the "locked fields"
  // spec -- clientLoginProfileId above deliberately predates 6.2 (null
  // firstName/lastName/dateOfBirth) so it doubles as the "still
  // editable" case instead.
  const onboardedClientId = randomUUID();
  const onboardedClientEmail = "e2e-client-onboarded@example.com";
  const onboardedClientPassword = "e2e-test-password-123";

  await client.query(
    `INSERT INTO "ClientProfile" (id, "instagramHandle", email, "firstName", "lastName", "dateOfBirth", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      onboardedClientId,
      "e2e_client_onboarded",
      onboardedClientEmail,
      "Jamie",
      "Rivera",
      "2000-01-01",
    ]
  );
  await client.query(
    `INSERT INTO "Account" (id, email, "passwordHash", role, "clientProfileId", "updatedAt")
     VALUES ($1, $2, $3, 'CLIENT', $4, now())`,
    [
      randomUUID(),
      onboardedClientEmail,
      hashPasswordForFixture(onboardedClientPassword),
      onboardedClientId,
    ]
  );

  await client.end();

  const fixture: E2eFixture = {
    artistId,
    clientProfileIds: [
      approveClientId,
      declineClientId,
      awaitingConfirmationClientId,
      freestylePendingClientId,
      bookedSlotClientId,
      rescheduleTestClientId,
      clientLoginProfileId,
      ...pastDueClientIds,
      cancelUpcomingClientId,
      onboardedClientId,
      maxEndTimeClientId,
    ],
    bookingRequestIds: [
      approveRequestId,
      declineRequestId,
      awaitingConfirmationRequestId,
      freestylePendingRequestId,
      bookedSlotRequestId,
      rescheduleTestRequestId,
      clientLoginRequestId,
      clientEditableRequestId,
      depositRequestId,
      ...pastDueRequestIds,
      cancelUpcomingRequestId,
      maxEndTimeRequestId,
    ],
    approveClientHandle,
    declineClientHandle,
    awaitingConfirmationClientHandle,
    freestylePendingClientHandle,
    bookedSlotClientHandle,
    rescheduleTestClientHandle,
    bookedSlotDate,
    bookedSlotTime,
    artistLoginEmail,
    artistLoginPassword,
    authenticatedSessionId,
    clientLoginEmail,
    clientLoginPassword,
    clientSignupEmail,
    onboardedClientEmail,
    onboardedClientPassword,
    maxEndTimeClientHandle,
    pastDueNoShowClientHandle,
    pastDueCompleteClientHandle,
    pastDueUntouchedClientHandle,
    cancelUpcomingClientHandle,
  };

  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
}
