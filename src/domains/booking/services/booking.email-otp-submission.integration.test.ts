import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
} from "@/domains/auth/constants";
import { sendVerificationEmail } from "@/domains/auth/services/sendVerificationEmail";
import { prisma } from "@/lib/prisma";
import { createIntegrationTracker, uniqueSuffix } from "@/testUtils/integrationDb";

import type { ClientBookingInput, SubmitBookingRequestWithEmailOtpResult } from "../types";
import { requestBookingVerificationCode } from "./requestBookingVerificationCode";
import { submitBookingRequestWithEmailOtp } from "./submitBookingRequestWithEmailOtp";

// External side effect only -- never hit Resend from the integration tier.
// The emailed code is read back from this mock.
vi.mock("@/domains/auth/services/sendVerificationEmail", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
}));

// Real-database email-code submit tests (54.5.2.6): booking's public flow
// end to end, request code -> submit, through the real auth services --
// the cross-domain run is the point of this tier (architecture.md Sec7's
// mocking mandate covers the unit tier). The unit tests mock both the
// verify and the booking write, so only Postgres can prove a double submit
// redeems the code once and creates one booking.
const tracker = createIntegrationTracker();
const sendVerificationEmailMock = vi.mocked(sendVerificationEmail);

// Within the code's attempt cap, so every submit can reserve an attempt and
// the race is decided at the consume guard. Also within the default pg pool
// size (10): the losers hold a connection each while queued on the consume.
const PARALLEL_SUBMITS = MAX_EMAIL_VERIFICATION_ATTEMPTS;
const FIRST_NAME = "Ada";
const LAST_NAME = "Lovelace";
const DATE_OF_BIRTH = "1995-04-12";
const PHONE = "07700900123";
const IMAGE_URLS = ["https://utfs.io/f/ref-one.jpg", "https://utfs.io/f/ref-two.jpg"];

type BookedResult = Extract<SubmitBookingRequestWithEmailOtpResult, { success: true }>;

const usedEmails = new Set<string>();

function newEmail(): string {
  const email = `it_otp_${uniqueSuffix()}@example.com`;
  tracker.trackEmail(email);
  usedEmails.add(email);
  return email;
}

// The verify provisions a ClientProfile (and its Account) that only the
// email identifies. Tracking it after every test lets the next wipe()
// remove it, its Account, Sessions and bookings, even after a failed
// assertion.
async function trackProvisionedProfiles(): Promise<void> {
  const profiles = await prisma.clientProfile.findMany({
    where: { email: { in: [...usedEmails] } },
    select: { id: true },
  });
  for (const { id } of profiles) {
    tracker.trackClientProfile(id);
  }
  usedEmails.clear();
}

// The parsed draft the controller would pass in: canonical lowercase
// email and handle, and TIER_3 content that passes validateComplexity.
function draftFor(email: string): ClientBookingInput {
  return {
    instagramHandle: `it_otp_${uniqueSuffix()}`,
    email,
    designReferenceImageUrls: IMAGE_URLS,
    tier: "TIER_3",
    clientBudgetRange: { minPrice: 100, maxPrice: 200 },
    designTags: ["fine-line-detail", "custom-illustration"],
    aestheticTags: ["watercolor-blend"],
    phone: PHONE,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    dateOfBirth: DATE_OF_BIRTH,
    clientNotes: "Soft gradient across the ring finger",
    requestedDate: "2040-01-01",
    requestedTime: "14:00",
    clientMaxEndTime: "17:00",
    paymentMethod: "CARD",
  };
}

// Issues the code through booking's real request path and returns the
// code that was "emailed".
async function requestCode(draft: ClientBookingInput): Promise<string> {
  expect(await requestBookingVerificationCode(draft)).toEqual({ success: true });
  expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
  const [sentTo, code] = sendVerificationEmailMock.mock.calls[0];
  expect(sentTo).toBe(draft.email);
  return code;
}

function isBooked(result: SubmitBookingRequestWithEmailOtpResult): result is BookedResult {
  return result.success;
}

describe("booking email-code submission integration", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(async () => {
    await tracker.wipe();
    sendVerificationEmailMock.mockClear();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
    await trackProvisionedProfiles();
  });

  afterAll(async () => {
    await tracker.wipe();
    await prisma.$disconnect();
  });

  it("a double submit of one code by a new client provisions once and creates one booking", async () => {
    const artist = await tracker.createArtist();
    const draft = draftFor(newEmail());
    const code = await requestCode(draft);

    const results = await Promise.all(
      Array.from({ length: PARALLEL_SUBMITS }, () =>
        submitBookingRequestWithEmailOtp({ ...draft, artistId: artist.id, code })
      )
    );

    expect(results.filter((r) => !r.success)).toEqual(
      Array(PARALLEL_SUBMITS - 1).fill({
        success: false,
        error: INVALID_EMAIL_OTP_ERROR_MESSAGE,
        session: null,
      })
    );
    const winners = results.filter(isBooked);
    expect(winners).toHaveLength(1);
    const [winner] = winners;
    // Handled losers: no unexpected-failure or booking-after-verify path.
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    // One new client, its blank details filled from the draft.
    const profile = await prisma.clientProfile.findUniqueOrThrow({
      where: { email: draft.email },
    });
    expect(profile).toMatchObject({
      instagramHandle: draft.instagramHandle,
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      phone: PHONE,
      dateOfBirth: new Date(`${DATE_OF_BIRTH}T00:00:00.000Z`),
    });
    const account = await prisma.account.findUniqueOrThrow({ where: { email: draft.email } });
    expect(account).toMatchObject({ role: "CLIENT", clientProfileId: profile.id });
    const sessions = await prisma.session.findMany({ where: { accountId: account.id } });
    expect(sessions).toEqual([
      expect.objectContaining({ id: winner.session.sessionId, activeRole: "CLIENT" }),
    ]);

    // One PENDING request with the draft's references and no allocation
    // (No Auto-Booking).
    const bookings = await prisma.bookingRequest.findMany({
      where: { artistId: artist.id },
      include: { designReferences: { select: { imageUrl: true } } },
    });
    expect(bookings).toHaveLength(1);
    const [booking] = bookings;
    expect(booking).toMatchObject({
      id: winner.bookingRequestId,
      status: "PENDING",
      clientId: profile.id,
      tier: "TIER_3",
    });
    expect(booking.designReferences.map((ref) => ref.imageUrl).sort()).toEqual(
      [...IMAGE_URLS].sort()
    );
    expect(await prisma.timeSlot.count({ where: { artistId: artist.id } })).toBe(0);

    const challenge = await prisma.emailOtpChallenge.findUniqueOrThrow({
      where: { email: draft.email },
    });
    expect(challenge.codeHash).toBeNull();
    expect(challenge.consumedAt).not.toBeNull();
  });
});
