import { prismaMock } from "@/testUtils/prismaMock";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";

const { getCurrentSessionMock, reviewBookingRequestMock, confirmProposedBookingMock } =
  vi.hoisted(() => ({
    getCurrentSessionMock: vi.fn(),
    reviewBookingRequestMock: vi.fn(),
    confirmProposedBookingMock: vi.fn(),
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

import {
  approveBookingRequest,
  confirmProposedBookingAction,
  declineBookingRequest,
  reviewBookingRequestAction,
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
