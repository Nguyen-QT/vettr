import { prismaMock } from "@/testUtils/prismaMock";

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";
import { Prisma } from "@/generated/prisma/client";

const {
  getCurrentSessionMock,
  reviewBookingRequestMock,
  confirmProposedBookingMock,
  cancelBookingRequestMock,
  updatePendingBookingRequestMock,
  updateClientProfileMock,
  rescheduleApprovedBookingMock,
  cancelApprovedBookingAsArtistMock,
  markAppointmentNoShowMock,
  markAppointmentCompletedMock,
  updateBookingPaymentMethodMock,
  createBookingRequestMock,
  validateComplexityMock,
  requestBookingVerificationCodeMock,
  submitBookingRequestWithEmailOtpMock,
  setSessionCookieMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  reviewBookingRequestMock: vi.fn(),
  confirmProposedBookingMock: vi.fn(),
  cancelBookingRequestMock: vi.fn(),
  updatePendingBookingRequestMock: vi.fn(),
  updateClientProfileMock: vi.fn(),
  rescheduleApprovedBookingMock: vi.fn(),
  cancelApprovedBookingAsArtistMock: vi.fn(),
  markAppointmentNoShowMock: vi.fn(),
  markAppointmentCompletedMock: vi.fn(),
  updateBookingPaymentMethodMock: vi.fn(),
  createBookingRequestMock: vi.fn(),
  validateComplexityMock: vi.fn(),
  requestBookingVerificationCodeMock: vi.fn(),
  submitBookingRequestWithEmailOtpMock: vi.fn(),
  setSessionCookieMock: vi.fn(),
}));

vi.mock("@/domains/auth/actions", () => ({
  getCurrentSession: getCurrentSessionMock,
}));
vi.mock("@/domains/auth/sessionCookie", () => ({
  setSessionCookie: setSessionCookieMock,
}));
vi.mock("./services/reviewBookingRequest", () => ({
  reviewBookingRequest: reviewBookingRequestMock,
}));
vi.mock("./services/confirmProposedBooking", () => ({
  confirmProposedBooking: confirmProposedBookingMock,
}));
vi.mock("./services/cancelBookingRequest", () => ({
  cancelBookingRequest: cancelBookingRequestMock,
}));
vi.mock("./services/updatePendingBookingRequest", () => ({
  updatePendingBookingRequest: updatePendingBookingRequestMock,
}));
vi.mock("./services/updateClientProfile", () => ({
  updateClientProfile: updateClientProfileMock,
}));

vi.mock("./services/rescheduleApprovedBooking", () => ({
  rescheduleApprovedBooking: rescheduleApprovedBookingMock,
}));
vi.mock("./services/cancelApprovedBookingAsArtist", () => ({
  cancelApprovedBookingAsArtist: cancelApprovedBookingAsArtistMock,
}));
vi.mock("./services/markAppointmentNoShow", () => ({
  markAppointmentNoShow: markAppointmentNoShowMock,
}));
vi.mock("./services/markAppointmentCompleted", () => ({
  markAppointmentCompleted: markAppointmentCompletedMock,
}));
vi.mock("./services/updateBookingPaymentMethod", () => ({
  updateBookingPaymentMethod: updateBookingPaymentMethodMock,
}));
vi.mock("./services/createBookingRequest", () => ({
  createBookingRequest: createBookingRequestMock,
}));
vi.mock("./services/validateComplexity", () => ({
  validateComplexity: validateComplexityMock,
}));
vi.mock("./services/requestBookingVerificationCode", () => ({
  requestBookingVerificationCode: requestBookingVerificationCodeMock,
}));
vi.mock("./services/submitBookingRequestWithEmailOtp", () => ({
  submitBookingRequestWithEmailOtp: submitBookingRequestWithEmailOtpMock,
}));

import {
  approveBookingRequest,
  cancelApprovedBookingAsArtistAction,
  cancelBookingRequestAction,
  confirmProposedBookingAction,
  declineBookingRequest,
  markAppointmentCompletedAction,
  markAppointmentNoShowAction,
  requestBookingVerificationCodeAction,
  rescheduleApprovedBookingAction,
  reviewBookingRequestAction,
  submitBookingRequest,
  submitBookingRequestWithCodeAction,
  updateBookingPaymentMethodAction,
  updateClientProfileAction,
  updatePendingBookingRequestAction,
} from "./actions";
import {
  BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
  CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
  EMAIL_VERIFICATION_REQUIRED_ERROR_MESSAGE,
} from "./constants";
import { generateResponseMessage } from "./services/generateResponseMessage";

const NOT_SIGNED_IN_AS_ARTIST = {
  success: false,
  error: "You must be signed in as an artist to do that.",
};
const REQUEST_NOT_FOUND = { success: false, error: "This request could not be found." };

function session(overrides: Partial<SessionWithAccount>): SessionWithAccount {
  return {
    sessionId: "session-1",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    accountId: "account-1",
    role: "CLIENT",
    activeRole: "CLIENT",
    artistId: null,
    clientProfileId: null,
    ...overrides,
  };
}

const ARTIST_SESSION = session({
  role: "ARTIST",
  activeRole: "ARTIST",
  artistId: "artist-1",
});

const REJECTED_ARTIST_SESSIONS: Array<[string, SessionWithAccount | null]> = [
  ["signed out", null],
  [
    "activeRole CLIENT despite holding an artistId",
    session({ role: "ARTIST", activeRole: "CLIENT", artistId: "artist-1" }),
  ],
  ["activeRole ARTIST with no artistId", session({ role: "ARTIST", activeRole: "ARTIST" })],
];

const REVIEW_INPUT = { durationMinutes: 120, estimatedPrice: 300 };
const VALID_RESCHEDULE = {
  requestedDate: "2099-06-01",
  requestedTime: "14:00",
  durationMinutes: 240,
};

type GuardedCase = [string, () => Promise<unknown>];

const GUARDED_ACTIONS: GuardedCase[] = [
  ["approveBookingRequest", () => approveBookingRequest("request-1")],
  ["declineBookingRequest", () => declineBookingRequest("request-1")],
  ["reviewBookingRequestAction", () => reviewBookingRequestAction("request-1", REVIEW_INPUT)],
  ["confirmProposedBookingAction", () => confirmProposedBookingAction("request-1")],
  [
    "rescheduleApprovedBookingAction",
    () => rescheduleApprovedBookingAction("request-1", VALID_RESCHEDULE),
  ],
  [
    "cancelApprovedBookingAsArtistAction",
    () => cancelApprovedBookingAsArtistAction("request-1"),
  ],
  ["markAppointmentNoShowAction", () => markAppointmentNoShowAction("request-1")],
  ["markAppointmentCompletedAction", () => markAppointmentCompletedAction("request-1")],
];

function expectNoMutation(): void {
  expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  expect(reviewBookingRequestMock).not.toHaveBeenCalled();
  expect(confirmProposedBookingMock).not.toHaveBeenCalled();
  expect(rescheduleApprovedBookingMock).not.toHaveBeenCalled();
  expect(cancelApprovedBookingAsArtistMock).not.toHaveBeenCalled();
  expect(markAppointmentNoShowMock).not.toHaveBeenCalled();
  expect(markAppointmentCompletedMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, so a rejection one test sets
  // would otherwise leak into the next. validateComplexity is synchronous
  // -- mockReturnValue, not mockResolvedValue.
  validateComplexityMock.mockReturnValue({ success: true });
});

describe.each(GUARDED_ACTIONS)("%s guard", (_name, invoke) => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without mutating",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await invoke();

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(prismaMock.bookingRequest.findUnique).not.toHaveBeenCalled();
      expectNoMutation();
    }
  );

  it("reports another artist's request as not found without mutating", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "other-artist",
    } as never);

    const result = await invoke();

    expect(result).toEqual(REQUEST_NOT_FOUND);
    expectNoMutation();
  });

  it("reports a missing request as not found without mutating", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue(null);

    const result = await invoke();

    expect(result).toEqual(REQUEST_NOT_FOUND);
    expectNoMutation();
  });
});

describe("owned request", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
  });

  it.each([
    ["approveBookingRequest", approveBookingRequest, "APPROVED"],
    ["declineBookingRequest", declineBookingRequest, "DECLINED"],
  ] as const)("%s updates the status", async (_name, action, status) => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    const result = await action("request-1");

    expect(result.success).toBe(true);
    expect(prismaMock.bookingRequest.update).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { status },
    });
  });

  it("reviewBookingRequestAction delegates the validated input", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
    reviewBookingRequestMock.mockResolvedValue({
      success: true,
      outcome: "APPROVED",
      responseMessage: "ok",
    });

    const result = await reviewBookingRequestAction("request-1", REVIEW_INPUT);

    expect(reviewBookingRequestMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      ...REVIEW_INPUT,
    });
    expect(result).toEqual({ success: true, outcome: "APPROVED", responseMessage: "ok" });
  });

  it("confirmProposedBookingAction delegates and passes the result through", async () => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
    confirmProposedBookingMock.mockResolvedValue({ success: true, responseMessage: "ok" });

    const result = await confirmProposedBookingAction("request-1");

    expect(confirmProposedBookingMock).toHaveBeenCalledWith("request-1");
    expect(result).toEqual({ success: true, responseMessage: "ok" });
  });
});

const NOT_SIGNED_IN_AS_CLIENT = {
  success: false,
  error: "You must be signed in as a client to do that.",
};

const CLIENT_SESSION = session({ clientProfileId: "profile-1" });

const REJECTED_CLIENT_SESSIONS: Array<[string, SessionWithAccount | null]> = [
  ["signed out", null],
  [
    "activeRole ARTIST despite holding a clientProfileId",
    session({
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: "profile-1",
    }),
  ],
  ["activeRole CLIENT with no clientProfileId", session({ activeRole: "CLIENT" })],
];

const VALID_PENDING_EDIT = {
  clientNotes: "  floral sleeve  ",
  clientBudgetRange: { minPrice: 100, maxPrice: 200 },
  requestedDate: "2099-06-01",
  requestedTime: "14:00",
  designReferenceImageUrls: ["https://example.com/ref.png"],
};

const VALID_PROFILE = {
  instagramHandle: "  @Valid.Handle ",
  phone: "07123456789",
  firstName: "  Ada ",
  lastName: " Lovelace  ",
  dateOfBirth: "1990-01-01",
};

function expectNoClientService(): void {
  expect(cancelBookingRequestMock).not.toHaveBeenCalled();
  expect(updatePendingBookingRequestMock).not.toHaveBeenCalled();
  expect(updateClientProfileMock).not.toHaveBeenCalled();
}

const CLIENT_GUARDED_ACTIONS: GuardedCase[] = [
  ["cancelBookingRequestAction", () => cancelBookingRequestAction("request-1")],
  [
    "updatePendingBookingRequestAction",
    () => updatePendingBookingRequestAction("request-1", VALID_PENDING_EDIT),
  ],
  ["updateClientProfileAction", () => updateClientProfileAction(VALID_PROFILE)],
];

describe.each(CLIENT_GUARDED_ACTIONS)("%s client guard", (_name, invoke) => {
  it.each(REJECTED_CLIENT_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await invoke();

      expect(result).toEqual(NOT_SIGNED_IN_AS_CLIENT);
      expectNoClientService();
    }
  );
});

describe("guard runs before validation", () => {
  it.each([
    [
      "updatePendingBookingRequestAction",
      () => updatePendingBookingRequestAction("request-1", {}),
    ],
    ["updateClientProfileAction", () => updateClientProfileAction({})],
  ] as GuardedCase[])(
    "%s returns the sign-in error for invalid input when signed out",
    async (_name, invoke) => {
      getCurrentSessionMock.mockResolvedValue(null);

      expect(await invoke()).toEqual(NOT_SIGNED_IN_AS_CLIENT);
      expectNoClientService();
    }
  );
});

describe("cancelBookingRequestAction", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
  });

  it("delegates with the session-derived clientProfileId", async () => {
    cancelBookingRequestMock.mockResolvedValue({ success: true });

    const result = await cancelBookingRequestAction("request-1");

    expect(cancelBookingRequestMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      clientProfileId: "profile-1",
    });
    expect(result).toEqual({ success: true });
  });

  it("passes a service error through unchanged", async () => {
    cancelBookingRequestMock.mockResolvedValue(REQUEST_NOT_FOUND);

    expect(await cancelBookingRequestAction("request-1")).toEqual(REQUEST_NOT_FOUND);
  });
});

describe("updatePendingBookingRequestAction", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
  });

  it("returns the first schema issue without calling the service", async () => {
    const result = await updatePendingBookingRequestAction("request-1", {
      ...VALID_PENDING_EDIT,
      designReferenceImageUrls: [],
    });

    expect(result).toEqual({
      success: false,
      error: "At least one design reference image is required.",
    });
    expect(updatePendingBookingRequestMock).not.toHaveBeenCalled();
  });

  it("sends session identity and parsed data only, ignoring hostile payload keys", async () => {
    updatePendingBookingRequestMock.mockResolvedValue({ success: true });

    await updatePendingBookingRequestAction("request-1", {
      ...VALID_PENDING_EDIT,
      clientProfileId: "attacker-profile",
      artistId: "attacker-artist",
      bookingRequestId: "attacker-request",
    });

    expect(updatePendingBookingRequestMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      clientProfileId: "profile-1",
      clientNotes: "floral sleeve",
      clientBudgetRange: { minPrice: 100, maxPrice: 200 },
      requestedDate: "2099-06-01",
      requestedTime: "14:00",
      designReferenceImageUrls: ["https://example.com/ref.png"],
    });
  });

  it("passes success and service errors through unchanged", async () => {
    updatePendingBookingRequestMock.mockResolvedValueOnce({ success: true });
    expect(await updatePendingBookingRequestAction("request-1", VALID_PENDING_EDIT)).toEqual({
      success: true,
    });

    updatePendingBookingRequestMock.mockResolvedValueOnce(REQUEST_NOT_FOUND);
    expect(await updatePendingBookingRequestAction("request-1", VALID_PENDING_EDIT)).toEqual(
      REQUEST_NOT_FOUND
    );
  });
});

describe("updateClientProfileAction", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
  });

  it("returns the first schema issue without calling the service", async () => {
    const result = await updateClientProfileAction({
      ...VALID_PROFILE,
      instagramHandle: "not a handle!",
    });

    expect(result).toEqual({
      success: false,
      error: "Enter a valid Instagram handle.",
    });
    expect(updateClientProfileMock).not.toHaveBeenCalled();
  });

  const NORMALISED_PROFILE = {
    clientProfileId: "profile-1",
    instagramHandle: "Valid.Handle",
    phone: "07123456789",
    firstName: "Ada",
    lastName: "Lovelace",
    dateOfBirth: "1990-01-01",
  };

  it("sends the session id and normalised fields, ignoring a hostile clientProfileId", async () => {
    updateClientProfileMock.mockResolvedValue({ success: true });

    await updateClientProfileAction({
      ...VALID_PROFILE,
      clientProfileId: "attacker-profile",
    });

    expect(updateClientProfileMock).toHaveBeenCalledWith(NORMALISED_PROFILE);
  });

  // 54.7: the verified email is the fixed client identity. An invalid
  // value proves the email is no longer validated; the exact-match
  // assertion proves it is never forwarded to the service.
  it("strips a supplied email instead of validating or forwarding it", async () => {
    updateClientProfileMock.mockResolvedValue({ success: true });

    const result = await updateClientProfileAction({
      ...VALID_PROFILE,
      email: "not-an-email",
    });

    expect(result).toEqual({ success: true });
    expect(updateClientProfileMock).toHaveBeenCalledWith(NORMALISED_PROFILE);
  });

  it("passes success and service errors through unchanged", async () => {
    updateClientProfileMock.mockResolvedValueOnce({ success: true });
    expect(await updateClientProfileAction(VALID_PROFILE)).toEqual({
      success: true,
    });

    const taken = {
      success: false,
      error: "That Instagram handle is already in use.",
    };
    updateClientProfileMock.mockResolvedValueOnce(taken);
    expect(await updateClientProfileAction(VALID_PROFILE)).toEqual(taken);
  });
});

describe("guard runs before validation (artist actions)", () => {
  it("rescheduleApprovedBookingAction returns the sign-in error for invalid input when signed out", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    expect(await rescheduleApprovedBookingAction("request-1", {})).toEqual(
      NOT_SIGNED_IN_AS_ARTIST
    );
    expect(rescheduleApprovedBookingMock).not.toHaveBeenCalled();
  });

  it("rescheduleApprovedBookingAction checks ownership before parsing input", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "other-artist",
    } as never);

    expect(await rescheduleApprovedBookingAction("request-1", {})).toEqual(REQUEST_NOT_FOUND);
    expect(rescheduleApprovedBookingMock).not.toHaveBeenCalled();
  });

  it("updateBookingPaymentMethodAction returns the sign-in error for invalid input when signed out", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    expect(await updateBookingPaymentMethodAction("request-1", "BITCOIN")).toEqual(
      NOT_SIGNED_IN_AS_ARTIST
    );
    expect(updateBookingPaymentMethodMock).not.toHaveBeenCalled();
  });
});

describe("rescheduleApprovedBookingAction", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
  });

  it.each([
    [
      "a past date",
      { ...VALID_RESCHEDULE, requestedDate: "2000-01-01" },
      "Choose a date and time in the future.",
    ],
    [
      "a duration below the minimum",
      { ...VALID_RESCHEDULE, durationMinutes: 30 },
      "The service duration must be at least 60 minutes.",
    ],
    [
      "a time outside the slot options",
      { ...VALID_RESCHEDULE, requestedTime: "09:00" },
      null,
    ],
  ])("rejects %s without calling the service", async (_label, input, message) => {
    const result = (await rescheduleApprovedBookingAction("request-1", input)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    if (message) expect(result.error).toBe(message);
    expect(rescheduleApprovedBookingMock).not.toHaveBeenCalled();
  });

  it("looks up ownership by id selecting only artistId", async () => {
    rescheduleApprovedBookingMock.mockResolvedValue({ success: true });

    await rescheduleApprovedBookingAction("request-1", VALID_RESCHEDULE);

    expect(prismaMock.bookingRequest.findUnique).toHaveBeenCalledWith({
      where: { id: "request-1" },
      select: { artistId: true },
    });
  });

  it("delegates the combined start time, ignoring hostile payload keys", async () => {
    rescheduleApprovedBookingMock.mockResolvedValue({ success: true });

    await rescheduleApprovedBookingAction("request-1", {
      ...VALID_RESCHEDULE,
      artistId: "attacker-artist",
      bookingRequestId: "attacker-request",
    });

    expect(rescheduleApprovedBookingMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      newStartTime: new Date("2099-06-01T14:00:00"),
      durationMinutes: 240,
    });
  });

  it("passes success and service errors through unchanged", async () => {
    rescheduleApprovedBookingMock.mockResolvedValueOnce({ success: true });
    expect(await rescheduleApprovedBookingAction("request-1", VALID_RESCHEDULE)).toEqual({
      success: true,
    });

    const conflict = { success: false, error: "That slot is not available." };
    rescheduleApprovedBookingMock.mockResolvedValueOnce(conflict);
    expect(await rescheduleApprovedBookingAction("request-1", VALID_RESCHEDULE)).toEqual(
      conflict
    );
  });
});

describe("artist id-only actions (owned request)", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
  });

  it.each([
    ["cancelApprovedBookingAsArtistAction", cancelApprovedBookingAsArtistAction, cancelApprovedBookingAsArtistMock],
    ["markAppointmentNoShowAction", markAppointmentNoShowAction, markAppointmentNoShowMock],
    ["markAppointmentCompletedAction", markAppointmentCompletedAction, markAppointmentCompletedMock],
  ] as const)("%s delegates the id and passes results through", async (_name, action, service) => {
    service.mockResolvedValueOnce({ success: true });
    expect(await action("request-1")).toEqual({ success: true });
    expect(service).toHaveBeenCalledWith({ bookingRequestId: "request-1" });

    const failure = { success: false, error: "Only approved bookings can be changed." };
    service.mockResolvedValueOnce(failure);
    expect(await action("request-1")).toEqual(failure);
  });
});

describe("updateBookingPaymentMethodAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      expect(await updateBookingPaymentMethodAction("request-1", "CARD")).toEqual(
        NOT_SIGNED_IN_AS_ARTIST
      );
      expect(updateBookingPaymentMethodMock).not.toHaveBeenCalled();
    }
  );

  it("returns the first schema issue for an invalid method without calling the service", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await updateBookingPaymentMethodAction("request-1", "BITCOIN");

    expect(result.success).toBe(false);
    expect(updateBookingPaymentMethodMock).not.toHaveBeenCalled();
  });

  it("delegates the session artistId and leaves ownership to the service", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    updateBookingPaymentMethodMock.mockResolvedValue({ success: true });

    const result = await updateBookingPaymentMethodAction("request-1", "CARD");

    expect(prismaMock.bookingRequest.findUnique).not.toHaveBeenCalled();
    expect(updateBookingPaymentMethodMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      artistId: "artist-1",
      paymentMethod: "CARD",
    });
    expect(result).toEqual({ success: true });
  });

  it("passes a service error through unchanged", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    updateBookingPaymentMethodMock.mockResolvedValue(REQUEST_NOT_FOUND);

    expect(await updateBookingPaymentMethodAction("request-1", "CASH")).toEqual(
      REQUEST_NOT_FOUND
    );
  });
});

describe("approveBookingRequest / declineBookingRequest (setBookingRequestStatus)", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
  });

  const STATUS_ACTIONS = [
    ["approveBookingRequest", approveBookingRequest, "APPROVED"],
    ["declineBookingRequest", declineBookingRequest, "DECLINED"],
  ] as const;

  it.each(STATUS_ACTIONS)("%s returns the exact response message", async (_name, action, status) => {
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
    prismaMock.bookingRequest.update.mockResolvedValue({} as never);

    expect(await action("request-1")).toEqual({
      success: true,
      responseMessage: generateResponseMessage(status),
    });
  });

  it.each(STATUS_ACTIONS)(
    "%s checks ownership selecting only artistId, then re-reads the row",
    async (_name, action) => {
      prismaMock.bookingRequest.findUnique.mockResolvedValue({
        artistId: "artist-1",
      } as never);
      prismaMock.bookingRequest.update.mockResolvedValue({} as never);

      await action("request-1");

      expect(prismaMock.bookingRequest.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: "request-1" },
        select: { artistId: true },
      });
      expect(prismaMock.bookingRequest.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: "request-1" },
      });
    }
  );

  it.each(STATUS_ACTIONS)(
    "%s reports a row deleted after the ownership check as not found without updating",
    async (_name, action) => {
      prismaMock.bookingRequest.findUnique
        .mockResolvedValueOnce({ artistId: "artist-1" } as never)
        .mockResolvedValueOnce(null);

      expect(await action("request-1")).toEqual(REQUEST_NOT_FOUND);
      expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
    }
  );
});

describe("guard runs before validation (review)", () => {
  it("reviewBookingRequestAction returns the sign-in error for invalid input when signed out", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    expect(await reviewBookingRequestAction("request-1", {})).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(prismaMock.bookingRequest.findUnique).not.toHaveBeenCalled();
    expect(reviewBookingRequestMock).not.toHaveBeenCalled();
  });

  it("reviewBookingRequestAction checks ownership before parsing input", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "other-artist",
    } as never);

    expect(await reviewBookingRequestAction("request-1", {})).toEqual(REQUEST_NOT_FOUND);
    expect(reviewBookingRequestMock).not.toHaveBeenCalled();
  });
});

describe("reviewBookingRequestAction", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
  });

  it.each([
    [
      "a duration below the minimum",
      { ...REVIEW_INPUT, durationMinutes: 30 },
      "The service duration must be at least 60 minutes.",
    ],
    ["a duration above the maximum", { ...REVIEW_INPUT, durationMinutes: 100_000 }, /cannot exceed/],
    ["a non-integer duration", { ...REVIEW_INPUT, durationMinutes: 90.5 }, null],
    ["a zero price", { ...REVIEW_INPUT, estimatedPrice: 0 }, "Enter an estimated price."],
    ["a missing price", { durationMinutes: 120 }, null],
  ] as const)("rejects %s without calling the service", async (_label, input, message) => {
    const result = await reviewBookingRequestAction("request-1", input);

    expect(result.success).toBe(false);
    if (message && !result.success) expect(result.error).toMatch(message);
    expect(reviewBookingRequestMock).not.toHaveBeenCalled();
  });

  it("delegates only the parsed fields, ignoring hostile payload keys", async () => {
    reviewBookingRequestMock.mockResolvedValue({
      success: true,
      outcome: "APPROVED",
      responseMessage: "ok",
    });

    await reviewBookingRequestAction("request-1", {
      ...REVIEW_INPUT,
      artistId: "attacker-artist",
      bookingRequestId: "attacker-request",
      status: "APPROVED",
    });

    expect(reviewBookingRequestMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      durationMinutes: 120,
      estimatedPrice: 300,
    });
  });

  it("passes a proposal and service errors through unchanged", async () => {
    const proposal = {
      success: true,
      outcome: "AWAITING_SLOT_CONFIRMATION",
      responseMessage: "needs confirmation",
    };
    reviewBookingRequestMock.mockResolvedValueOnce(proposal);
    expect(await reviewBookingRequestAction("request-1", REVIEW_INPUT)).toEqual(proposal);

    const conflict = { success: false, error: "That slot is not available." };
    reviewBookingRequestMock.mockResolvedValueOnce(conflict);
    expect(await reviewBookingRequestAction("request-1", REVIEW_INPUT)).toEqual(conflict);
  });
});

describe("confirmProposedBookingAction", () => {
  it("passes a service error through unchanged", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.bookingRequest.findUnique.mockResolvedValue({
      artistId: "artist-1",
    } as never);
    const failure = { success: false, error: "This request is not awaiting confirmation." };
    confirmProposedBookingMock.mockResolvedValue(failure);

    expect(await confirmProposedBookingAction("request-1")).toEqual(failure);
  });
});

describe("submitBookingRequest", () => {
  // Has to pass clientBookingInputSchema, which still requires the guest
  // identity fields -- the signed-in path then drops them. Padded strings
  // prove the parsed (trimmed) values are what get passed on; every
  // optional field is set so toStrictEqual has no undefined keys.
  const VALID_BOOKING_DRAFT = {
    instagramHandle: "  @Valid.Handle ",
    email: "client@example.com",
    designReferenceImageUrls: ["https://example.com/ref.png"],
    tier: "TIER_3",
    clientBudgetRange: { minPrice: 100, maxPrice: 200 },
    designTags: ["fine-line-detail"],
    aestheticTags: ["watercolor-blend"],
    phone: " 07123456789 ",
    firstName: "  Ada ",
    lastName: " Lovelace  ",
    dateOfBirth: "1990-01-01",
    clientNotes: "  floral sleeve  ",
    requestedDate: "2099-06-01",
    requestedTime: "14:00",
    clientMaxEndTime: "18:00",
    paymentMethod: "CARD",
  };

  const ARTIST_NOT_FOUND = {
    success: false,
    error: "This booking page could not be found.",
  };

  beforeEach(() => {
    prismaMock.artist.findUnique.mockResolvedValue({ id: "artist-1" } as never);
  });

  function expectNoBookingWrite(): void {
    expect(createBookingRequestMock).not.toHaveBeenCalled();
    expect(prismaMock.bookingRequest.create).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled();
    expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
  }

  it("returns the first schema issue before any lookup or write", async () => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);

    const result = await submitBookingRequest("artist-1", {
      ...VALID_BOOKING_DRAFT,
      designReferenceImageUrls: [],
    });

    expect(result).toEqual({
      success: false,
      error: "At least one design reference image is required.",
    });
    expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
    expect(validateComplexityMock).not.toHaveBeenCalled();
    expectNoBookingWrite();
  });

  it("rejects an unknown artist before screening or writing", async () => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
    prismaMock.artist.findUnique.mockResolvedValue(null);

    expect(await submitBookingRequest("missing-artist", VALID_BOOKING_DRAFT)).toEqual(
      ARTIST_NOT_FOUND
    );
    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { id: "missing-artist" },
    });
    expect(validateComplexityMock).not.toHaveBeenCalled();
    expectNoBookingWrite();
  });

  it("passes a complexity rejection through without writing", async () => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
    validateComplexityMock.mockReturnValue({ success: false, error: "Rejected." });

    expect(await submitBookingRequest("artist-1", VALID_BOOKING_DRAFT)).toEqual({
      success: false,
      error: "Rejected.",
    });
    expect(validateComplexityMock.mock.calls).toStrictEqual([
      [
        {
          tier: "TIER_3",
          clientNotes: "floral sleeve",
          designTags: ["fine-line-detail"],
          aestheticTags: ["watercolor-blend"],
        },
      ],
    ]);
    expectNoBookingWrite();
  });

  describe("signed in as a CLIENT", () => {
    beforeEach(() => {
      getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
    });

    it("delegates the parsed draft with session identity only, ignoring hostile keys", async () => {
      createBookingRequestMock.mockResolvedValue({
        success: true,
        bookingRequestId: "request-1",
      });

      await submitBookingRequest("artist-1", {
        ...VALID_BOOKING_DRAFT,
        clientProfileId: "attacker-profile",
        artistId: "attacker-artist",
        accountId: "attacker-account",
      });

      // Literal values, not derived from the fixture: the names, notes and
      // phone are the trimmed ones, and there is no instagramHandle, email
      // or hostile key -- toStrictEqual fails on any extra key.
      expect(createBookingRequestMock.mock.calls).toStrictEqual([
        [
          {
            clientProfileId: "profile-1",
            artistId: "artist-1",
            designReferenceImageUrls: ["https://example.com/ref.png"],
            tier: "TIER_3",
            clientBudgetRange: { minPrice: 100, maxPrice: 200 },
            designTags: ["fine-line-detail"],
            aestheticTags: ["watercolor-blend"],
            phone: "07123456789",
            firstName: "Ada",
            lastName: "Lovelace",
            dateOfBirth: "1990-01-01",
            clientNotes: "floral sleeve",
            requestedDate: "2099-06-01",
            requestedTime: "14:00",
            clientMaxEndTime: "18:00",
            paymentMethod: "CARD",
          },
        ],
      ]);
    });

    it("writes nothing itself -- the profile fill and the create are the service's", async () => {
      createBookingRequestMock.mockResolvedValue({
        success: true,
        bookingRequestId: "request-1",
      });

      await submitBookingRequest("artist-1", VALID_BOOKING_DRAFT);

      expect(prismaMock.clientProfile.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.clientProfile.update).not.toHaveBeenCalled();
      expect(prismaMock.bookingRequest.create).not.toHaveBeenCalled();
    });

    it("passes success and the service's generic error through unchanged", async () => {
      const created = { success: true, bookingRequestId: "request-1" };
      createBookingRequestMock.mockResolvedValueOnce(created);
      expect(await submitBookingRequest("artist-1", VALID_BOOKING_DRAFT)).toEqual(created);

      const failure = {
        success: false,
        error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
      };
      createBookingRequestMock.mockResolvedValueOnce(failure);
      expect(await submitBookingRequest("artist-1", VALID_BOOKING_DRAFT)).toEqual(failure);
    });
  });

  // 54.6.3.1: no unverified guest path -- every non-CLIENT session gets
  // the same generic copy before any lookup, screening or write.
  describe("without a CLIENT session", () => {
    const VERIFY_EMAIL_REQUIRED = {
      success: false,
      error: EMAIL_VERIFICATION_REQUIRED_ERROR_MESSAGE,
    };

    it.each(REJECTED_CLIENT_SESSIONS)(
      "refuses with the verify-email message and writes nothing when %s",
      async (_label, current) => {
        getCurrentSessionMock.mockResolvedValue(current);

        expect(await submitBookingRequest("artist-1", VALID_BOOKING_DRAFT)).toEqual(
          VERIFY_EMAIL_REQUIRED
        );
        expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
        expect(validateComplexityMock).not.toHaveBeenCalled();
        expectNoBookingWrite();
      }
    );

    it("refuses before parsing, so an invalid draft gets no schema issue", async () => {
      getCurrentSessionMock.mockResolvedValue(null);

      expect(
        await submitBookingRequest("artist-1", {
          ...VALID_BOOKING_DRAFT,
          designReferenceImageUrls: [],
        })
      ).toEqual(VERIFY_EMAIL_REQUIRED);
      expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
      expectNoBookingWrite();
    });

    it("never trusts a payload clientProfileId in place of the session", async () => {
      getCurrentSessionMock.mockResolvedValue(null);

      expect(
        await submitBookingRequest("artist-1", {
          ...VALID_BOOKING_DRAFT,
          clientProfileId: "attacker-profile",
          accountId: "attacker-account",
        })
      ).toEqual(VERIFY_EMAIL_REQUIRED);
      expectNoBookingWrite();
    });
  });
});

// The email-code draft (54.5.3.4). Padded strings prove the parsed values
// -- trimmed names and notes, the normalised email, the stripped "@" -- are
// what get passed on. Every optional field is set so toStrictEqual has no
// undefined keys.
const VALID_CODE_DRAFT = {
  instagramHandle: "  @Valid.Handle ",
  email: "  Client@Example.COM ",
  designReferenceImageUrls: ["https://example.com/ref.png"],
  tier: "TIER_3",
  clientBudgetRange: { minPrice: 100, maxPrice: 200 },
  designTags: ["fine-line-detail"],
  aestheticTags: ["watercolor-blend"],
  phone: " 07123456789 ",
  firstName: "  Ada ",
  lastName: " Lovelace  ",
  dateOfBirth: "1990-01-01",
  clientNotes: "  floral sleeve  ",
  requestedDate: "2099-06-01",
  requestedTime: "14:00",
  clientMaxEndTime: "18:00",
  paymentMethod: "CARD",
};

const HOSTILE_IDS = {
  clientProfileId: "attacker-profile",
  artistId: "attacker-artist",
  accountId: "attacker-account",
  sessionId: "attacker-session",
};

describe("requestBookingVerificationCodeAction", () => {
  it("returns the first schema issue without sending a code", async () => {
    const result = await requestBookingVerificationCodeAction({
      ...VALID_CODE_DRAFT,
      email: "not-an-email",
    });

    expect(result).toEqual({ success: false, error: "Enter a valid email address." });
    expect(requestBookingVerificationCodeMock).not.toHaveBeenCalled();
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("sends only the screening fields, ignoring hostile ids, with no lookup, session or cookie", async () => {
    requestBookingVerificationCodeMock.mockResolvedValue({ success: true });

    await requestBookingVerificationCodeAction({ ...VALID_CODE_DRAFT, ...HOSTILE_IDS });

    expect(requestBookingVerificationCodeMock.mock.calls).toStrictEqual([
      [
        {
          email: "client@example.com",
          tier: "TIER_3",
          clientNotes: "floral sleeve",
          designTags: ["fine-line-detail"],
          aestheticTags: ["watercolor-blend"],
        },
      ],
    ]);
    expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("passes success and service errors through unchanged", async () => {
    requestBookingVerificationCodeMock.mockResolvedValueOnce({ success: true });
    expect(await requestBookingVerificationCodeAction(VALID_CODE_DRAFT)).toEqual({
      success: true,
    });

    const rejected = { success: false, error: "Rejected." };
    requestBookingVerificationCodeMock.mockResolvedValueOnce(rejected);
    expect(await requestBookingVerificationCodeAction(VALID_CODE_DRAFT)).toEqual(rejected);
  });
});

describe("submitBookingRequestWithCodeAction", () => {
  // Leading zero proves the code stays a string end to end.
  const SUBMIT_INPUT = { ...VALID_CODE_DRAFT, code: "012345" };
  const VERIFIED_SESSION = {
    sessionId: "verified-session",
    expiresAt: new Date("2099-02-01T00:00:00.000Z"),
  };

  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    prismaMock.artist.findUnique.mockResolvedValue({ id: "artist-1" } as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  function expectNothingRedeemed(): void {
    expect(submitBookingRequestWithEmailOtpMock).not.toHaveBeenCalled();
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  }

  it("returns the first schema issue before any lookup", async () => {
    const result = await submitBookingRequestWithCodeAction("artist-1", {
      ...SUBMIT_INPUT,
      code: "12345",
    });

    expect(result).toEqual({
      success: false,
      error: "Enter the 6-digit code.",
      signedIn: false,
    });
    expect(prismaMock.artist.findUnique).not.toHaveBeenCalled();
    expectNothingRedeemed();
  });

  it("rejects an unknown artist before redeeming the code", async () => {
    prismaMock.artist.findUnique.mockResolvedValue(null);

    expect(await submitBookingRequestWithCodeAction("missing-artist", SUBMIT_INPUT)).toEqual({
      success: false,
      error: "This booking page could not be found.",
      signedIn: false,
    });
    expect(prismaMock.artist.findUnique).toHaveBeenCalledWith({
      where: { id: "missing-artist" },
      select: { id: true },
    });
    expectNothingRedeemed();
  });

  it("returns the generic error and logs the Prisma code only when the artist lookup fails", async () => {
    prismaMock.artist.findUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Timed out for client@example.com", {
        code: "P1008",
        clientVersion: "test",
      })
    );

    expect(await submitBookingRequestWithCodeAction("artist-1", SUBMIT_INPUT)).toEqual({
      success: false,
      error: CREATE_BOOKING_REQUEST_UNEXPECTED_ERROR_MESSAGE,
      signedIn: false,
    });
    expect(consoleErrorSpy.mock.calls).toStrictEqual([
      [
        {
          operation: "submitBookingRequestWithCodeAction",
          reason: "artist_lookup_failed",
          errorCode: "P1008",
        },
      ],
    ]);
    expectNothingRedeemed();
  });

  it("delegates the parsed draft, route artistId and code, ignoring hostile ids", async () => {
    submitBookingRequestWithEmailOtpMock.mockResolvedValue({
      success: true,
      bookingRequestId: "request-1",
      session: VERIFIED_SESSION,
    });

    await submitBookingRequestWithCodeAction("artist-1", { ...SUBMIT_INPUT, ...HOSTILE_IDS });

    // Literal values, not derived from the fixture -- toStrictEqual fails
    // on any extra key, so no hostile id reaches the service.
    expect(submitBookingRequestWithEmailOtpMock.mock.calls).toStrictEqual([
      [
        {
          instagramHandle: "Valid.Handle",
          email: "client@example.com",
          designReferenceImageUrls: ["https://example.com/ref.png"],
          tier: "TIER_3",
          clientBudgetRange: { minPrice: 100, maxPrice: 200 },
          designTags: ["fine-line-detail"],
          aestheticTags: ["watercolor-blend"],
          phone: "07123456789",
          firstName: "Ada",
          lastName: "Lovelace",
          dateOfBirth: "1990-01-01",
          clientNotes: "floral sleeve",
          requestedDate: "2099-06-01",
          requestedTime: "14:00",
          clientMaxEndTime: "18:00",
          paymentMethod: "CARD",
          code: "012345",
          artistId: "artist-1",
        },
      ],
    ]);
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
  });

  it("sends a blank phone as not provided", async () => {
    submitBookingRequestWithEmailOtpMock.mockResolvedValue({
      success: true,
      bookingRequestId: "request-1",
      session: VERIFIED_SESSION,
    });

    await submitBookingRequestWithCodeAction("artist-1", { ...SUBMIT_INPUT, phone: "   " });

    expect(submitBookingRequestWithEmailOtpMock.mock.calls[0]?.[0].phone).toBeUndefined();
  });

  it("sets the cookie on success and returns no session fields", async () => {
    submitBookingRequestWithEmailOtpMock.mockResolvedValue({
      success: true,
      bookingRequestId: "request-1",
      session: VERIFIED_SESSION,
    });

    const result = await submitBookingRequestWithCodeAction("artist-1", SUBMIT_INPUT);

    expect(result).toStrictEqual({ success: true, bookingRequestId: "request-1" });
    expect(setSessionCookieMock.mock.calls).toStrictEqual([
      ["verified-session", new Date("2099-02-01T00:00:00.000Z")],
    ]);
  });

  it("still sets the cookie when the booking fails after verification, and says so", async () => {
    submitBookingRequestWithEmailOtpMock.mockResolvedValue({
      success: false,
      error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
      session: VERIFIED_SESSION,
    });

    const result = await submitBookingRequestWithCodeAction("artist-1", SUBMIT_INPUT);

    expect(result).toStrictEqual({
      success: false,
      error: BOOKING_FAILED_AFTER_VERIFICATION_ERROR_MESSAGE,
      signedIn: true,
    });
    expect(setSessionCookieMock.mock.calls).toStrictEqual([
      ["verified-session", new Date("2099-02-01T00:00:00.000Z")],
    ]);
  });

  it("sets no cookie when verification fails, passing the error through", async () => {
    const invalidCode = "That code is invalid or has expired.";
    submitBookingRequestWithEmailOtpMock.mockResolvedValue({
      success: false,
      error: invalidCode,
      session: null,
    });

    const result = await submitBookingRequestWithCodeAction("artist-1", SUBMIT_INPUT);

    expect(result).toStrictEqual({ success: false, error: invalidCode, signedIn: false });
    expect(setSessionCookieMock).not.toHaveBeenCalled();
  });
});
