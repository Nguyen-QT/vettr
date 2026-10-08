import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import {
  ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE,
  INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE,
  INVALID_EMAIL_OTP_ERROR_MESSAGE,
  VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
} from "@/domains/auth/constants";
import { verifyEmailOtpAndProvisionClient } from "@/domains/auth/services/verifyEmailOtpAndProvisionClient";
import { Prisma } from "@/generated/prisma/client";

import {
  BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
  CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
} from "../constants";
import type { CreateBookingRequestInput, SubmitBookingRequestWithEmailOtpInput } from "../types";
import { createBookingRequest } from "./createBookingRequest";
import { submitBookingRequestWithEmailOtp } from "./submitBookingRequestWithEmailOtp";
import { validateComplexity } from "./validateComplexity";

vi.mock("@/domains/auth/services/verifyEmailOtpAndProvisionClient", () => ({
  verifyEmailOtpAndProvisionClient: vi.fn(),
}));

vi.mock("./createBookingRequest", () => ({
  createBookingRequest: vi.fn(),
}));

// Unit test (architecture.md Sec7): auth's verify is mocked at its public
// contract and createBookingRequest at its module (its own tests cover the
// Prisma payload), so nothing here touches a database. validateComplexity is
// real (same domain, pure), so each rejection case also proves that field
// reaches the check.
const EMAIL = "client@example.com";
const CODE = "482913";
const INSTAGRAM_HANDLE = "ada.ink";
const ARTIST_ID = "artist_1";
const VERIFIED_PROFILE_ID = "verified_profile_1";
const SESSION_ID = "session_1";
const EXPIRES_AT = new Date("2026-11-08T12:00:00.000Z");
const BOOKING_REQUEST_ID = "booking_request_1";
const FIRST_NAME = "Ada";
const LAST_NAME = "Lovelace";
const DATE_OF_BIRTH = "1995-04-12";
const PHONE = "07700900123";
const CLIENT_NOTES = "Soft gradient across the ring finger";
const IMAGE_URLS = ["https://utfs.io/f/ref-one.jpg", "https://utfs.io/f/ref-two.jpg"];

const SESSION = { sessionId: SESSION_ID, expiresAt: EXPIRES_AT };
const OPERATION = "submitBookingRequestWithEmailOtp";

function fullDraft(): SubmitBookingRequestWithEmailOtpInput {
  return {
    artistId: ARTIST_ID,
    code: CODE,
    instagramHandle: INSTAGRAM_HANDLE,
    email: EMAIL,
    designReferenceImageUrls: IMAGE_URLS,
    tier: "TIER_3",
    clientBudgetRange: { minPrice: 100, maxPrice: 200 },
    designTags: ["fine-line-detail", "custom-illustration"],
    aestheticTags: ["watercolor-blend"],
    phone: PHONE,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    dateOfBirth: DATE_OF_BIRTH,
    clientNotes: CLIENT_NOTES,
    requestedDate: "2026-11-02",
    requestedTime: "14:00",
    clientMaxEndTime: "17:00",
    paymentMethod: "CARD",
  };
}

// fullDraft minus the handle, email and code, plus the verified profile.
function expectedCreateInput(): CreateBookingRequestInput {
  return {
    clientProfileId: VERIFIED_PROFILE_ID,
    artistId: ARTIST_ID,
    designReferenceImageUrls: IMAGE_URLS,
    tier: "TIER_3",
    clientBudgetRange: { minPrice: 100, maxPrice: 200 },
    designTags: ["fine-line-detail", "custom-illustration"],
    aestheticTags: ["watercolor-blend"],
    phone: PHONE,
    firstName: FIRST_NAME,
    lastName: LAST_NAME,
    dateOfBirth: DATE_OF_BIRTH,
    clientNotes: CLIENT_NOTES,
    requestedDate: "2026-11-02",
    requestedTime: "14:00",
    clientMaxEndTime: "17:00",
    paymentMethod: "CARD",
  };
}

function expectNoPiiLogged(logged: string): void {
  for (const value of [EMAIL, CODE, INSTAGRAM_HANDLE, FIRST_NAME, LAST_NAME, PHONE, DATE_OF_BIRTH]) {
    expect(logged).not.toContain(value);
  }
}

describe("submitBookingRequestWithEmailOtp", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(verifyEmailOtpAndProvisionClient).mockReset();
    vi.mocked(verifyEmailOtpAndProvisionClient).mockResolvedValue({
      success: true,
      sessionId: SESSION_ID,
      expiresAt: EXPIRES_AT,
      clientProfileId: VERIFIED_PROFILE_ID,
    });
    vi.mocked(createBookingRequest).mockReset();
    vi.mocked(createBookingRequest).mockResolvedValue({
      success: true,
      bookingRequestId: BOOKING_REQUEST_ID,
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("verifies with only the email, code and handle, then books against the verified profile", async () => {
    const result = await submitBookingRequestWithEmailOtp(fullDraft());

    // No clientProfileId: auth's id stays inside booking.
    expect(result).toStrictEqual({
      success: true,
      bookingRequestId: BOOKING_REQUEST_ID,
      session: SESSION,
    });
    expect(vi.mocked(verifyEmailOtpAndProvisionClient).mock.calls).toStrictEqual([
      [{ email: EMAIL, code: CODE, instagramHandle: INSTAGRAM_HANDLE }],
    ]);
    // Strict: no handle, email, code or stray key reaches the booking write.
    expect(vi.mocked(createBookingRequest).mock.calls).toStrictEqual([[expectedCreateInput()]]);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("ignores a clientProfileId smuggled into the payload", async () => {
    const hostile = { ...fullDraft(), clientProfileId: "someone_elses_profile" };

    await submitBookingRequestWithEmailOtp(hostile);

    expect(vi.mocked(createBookingRequest).mock.calls).toStrictEqual([[expectedCreateInput()]]);
  });

  it.each<[string, Partial<SubmitBookingRequestWithEmailOtpInput>]>([
    ["notes", { tier: "TIER_3", clientNotes: "Just a simple heart", designTags: undefined }],
    ["design tags", { tier: "TIER_2", designTags: ["small-basic"], clientNotes: undefined }],
    [
      "aesthetic tags",
      { tier: "FREESTYLE", aestheticTags: ["minimalist-clean"], designTags: undefined, clientNotes: undefined },
    ],
  ])("rejects basic work in the %s before the code is checked", async (_field, edit) => {
    const draft = { ...fullDraft(), ...edit };
    const expected = validateComplexity({
      tier: draft.tier,
      clientNotes: draft.clientNotes,
      designTags: draft.designTags,
      aestheticTags: draft.aestheticTags,
    });
    expect(expected.success).toBe(false);

    const result = await submitBookingRequestWithEmailOtp(draft);

    expect(result).toStrictEqual({ ...expected, session: null });
    expect(verifyEmailOtpAndProvisionClient).not.toHaveBeenCalled();
    expect(createBookingRequest).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["an invalid code", INVALID_EMAIL_OTP_ERROR_MESSAGE],
    ["an artist-account email", ARTIST_ACCOUNT_SWITCH_TO_CLIENT_VIEW_MESSAGE],
    ["a taken handle", INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE],
    ["auth's generic failure", VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE],
  ])("passes %s through with no session and no booking", async (_case, error) => {
    vi.mocked(verifyEmailOtpAndProvisionClient).mockResolvedValue({ success: false, error });

    const result = await submitBookingRequestWithEmailOtp(fullDraft());

    expect(result).toStrictEqual({ success: false, error, session: null });
    expect(createBookingRequest).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a Prisma error",
      new Prisma.PrismaClientKnownRequestError(`Write conflict for ${EMAIL} / ${CODE}`, {
        code: "P2034",
        clientVersion: "test",
      }),
      "P2034",
    ],
    ["a non-Prisma error", new Error(`timeout for ${EMAIL} / ${CODE}`), undefined],
  ])("returns the generic verify error with no session if auth throws %s", async (_case, thrown, errorCode) => {
    vi.mocked(verifyEmailOtpAndProvisionClient).mockRejectedValue(thrown);

    const result = await submitBookingRequestWithEmailOtp(fullDraft());

    expect(result).toStrictEqual({
      success: false,
      error: VERIFY_BOOKING_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE,
      session: null,
    });
    expect(createBookingRequest).not.toHaveBeenCalled();
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: OPERATION, reason: "unexpected_failure", errorCode }],
    ]);
    expectNoPiiLogged(JSON.stringify(consoleErrorSpy.mock.calls));
  });

  it("keeps the session when the booking write fails after verification", async () => {
    vi.mocked(createBookingRequest).mockResolvedValue({
      success: false,
      error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
    });

    const result = await submitBookingRequestWithEmailOtp(fullDraft());

    expect(result).toStrictEqual({
      success: false,
      error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
      session: SESSION,
    });
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: OPERATION, reason: "booking_failed_after_verification", errorCode: undefined }],
    ]);
  });

  it("keeps the session and logs only the Prisma code when the booking write throws after verification", async () => {
    vi.mocked(createBookingRequest).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        `Foreign key failed for ${FIRST_NAME} ${LAST_NAME}, ${PHONE}, ${DATE_OF_BIRTH}`,
        { code: "P2003", clientVersion: "test" }
      )
    );

    const result = await submitBookingRequestWithEmailOtp(fullDraft());

    expect(result).toStrictEqual({
      success: false,
      error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
      session: SESSION,
    });
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [{ operation: OPERATION, reason: "booking_failed_after_verification", errorCode: "P2003" }],
    ]);
    expectNoPiiLogged(JSON.stringify(consoleErrorSpy.mock.calls));
  });
});
