import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";

const {
  getCurrentSessionMock,
  reviewBookingRequestMock,
  confirmProposedBookingMock,
  cancelBookingRequestMock,
  updatePendingBookingRequestMock,
  updateClientProfileMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  reviewBookingRequestMock: vi.fn(),
  confirmProposedBookingMock: vi.fn(),
  cancelBookingRequestMock: vi.fn(),
  updatePendingBookingRequestMock: vi.fn(),
  updateClientProfileMock: vi.fn(),
}));

vi.mock("@/domains/auth/actions", () => ({
  getCurrentSession: getCurrentSessionMock,
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

import {
  approveBookingRequest,
  cancelBookingRequestAction,
  confirmProposedBookingAction,
  declineBookingRequest,
  reviewBookingRequestAction,
  updateClientProfileAction,
  updatePendingBookingRequestAction,
} from "./actions";

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

type GuardedCase = [string, () => Promise<unknown>];

const GUARDED_ACTIONS: GuardedCase[] = [
  ["approveBookingRequest", () => approveBookingRequest("request-1")],
  ["declineBookingRequest", () => declineBookingRequest("request-1")],
  ["reviewBookingRequestAction", () => reviewBookingRequestAction("request-1", REVIEW_INPUT)],
  ["confirmProposedBookingAction", () => confirmProposedBookingAction("request-1")],
];

function expectNoMutation(): void {
  expect(prismaMock.bookingRequest.update).not.toHaveBeenCalled();
  expect(reviewBookingRequestMock).not.toHaveBeenCalled();
  expect(confirmProposedBookingMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
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
  email: "client@example.com",
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

  it("sends the session id and normalised fields, ignoring a hostile clientProfileId", async () => {
    updateClientProfileMock.mockResolvedValue({ success: true });

    await updateClientProfileAction({
      ...VALID_PROFILE,
      clientProfileId: "attacker-profile",
    });

    expect(updateClientProfileMock).toHaveBeenCalledWith({
      clientProfileId: "profile-1",
      instagramHandle: "Valid.Handle",
      email: "client@example.com",
      phone: "07123456789",
      firstName: "Ada",
      lastName: "Lovelace",
      dateOfBirth: "1990-01-01",
    });
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
