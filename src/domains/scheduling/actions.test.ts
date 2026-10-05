import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";
import { prismaMock } from "@/testUtils/prismaMock";

const {
  getCurrentSessionMock,
  getAvailableSlotsMock,
  setWeeklyHoursMock,
  setScheduleOverrideMock,
  setScheduleOverrideRangeMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  getAvailableSlotsMock: vi.fn(),
  setWeeklyHoursMock: vi.fn(),
  setScheduleOverrideMock: vi.fn(),
  setScheduleOverrideRangeMock: vi.fn(),
}));

// Cross-module call, so a plain module mock intercepts it.
vi.mock("@/domains/auth/actions", () => ({
  getCurrentSession: getCurrentSessionMock,
}));
vi.mock("./services/getAvailableSlots", () => ({
  getAvailableSlots: getAvailableSlotsMock,
}));
vi.mock("./services/setWeeklyHours", () => ({ setWeeklyHours: setWeeklyHoursMock }));
vi.mock("./services/setScheduleOverride", () => ({
  setScheduleOverride: setScheduleOverrideMock,
}));
vi.mock("./services/setScheduleOverrideRange", () => ({
  setScheduleOverrideRange: setScheduleOverrideRangeMock,
}));

import {
  getAvailableSlotsAction,
  getScheduleOverridesAction,
  getWeeklyHoursAction,
  setScheduleOverrideAction,
  setScheduleOverrideRangeAction,
  setWeeklyHoursAction,
} from "./actions";

const NOT_SIGNED_IN_AS_ARTIST = {
  success: false,
  error: "You must be signed in as an artist to do that.",
};

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

// Every way requireArtistId() must refuse: no session, a dual-role account
// currently acting as a client, and an ARTIST session with no artist id.
const REJECTED_SESSIONS: Array<[string, SessionWithAccount | null]> = [
  ["signed out", null],
  [
    "activeRole CLIENT despite holding an artistId",
    session({ role: "ARTIST", activeRole: "CLIENT", artistId: "artist-1" }),
  ],
  ["activeRole ARTIST with no artistId", session({ role: "ARTIST", activeRole: "ARTIST" })],
];

// An attacker-supplied artistId in the payload must never reach a service
// or a query (validation.md §2).
const HOSTILE = { artistId: "attacker-artist" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setWeeklyHoursAction", () => {
  const input = { dayOfWeek: 2, availableTimes: ["11:00", "14:00"] };

  it.each(REJECTED_SESSIONS)("rejects when %s and never calls the service", async (_name, s) => {
    getCurrentSessionMock.mockResolvedValue(s);

    expect(await setWeeklyHoursAction(input)).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(setWeeklyHoursMock).not.toHaveBeenCalled();
  });

  it("returns the first schema issue and skips the service on invalid input", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setWeeklyHoursAction({ ...input, dayOfWeek: 9 });

    expect(result).toEqual({
      success: false,
      error: "Day of week must be between 0 (Sunday) and 6 (Saturday).",
    });
    expect(setWeeklyHoursMock).not.toHaveBeenCalled();
  });

  it("passes the session artistId and ignores a hostile payload artistId", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setWeeklyHoursAction({ ...input, ...HOSTILE });

    expect(result).toEqual({ success: true });
    expect(setWeeklyHoursMock).toHaveBeenCalledWith({
      artistId: "artist-1",
      dayOfWeek: 2,
      availableTimes: ["11:00", "14:00"],
    });
  });
});

describe("setScheduleOverrideAction", () => {
  const input = { date: "2027-05-01", availableTimes: ["11:00"] };

  it.each(REJECTED_SESSIONS)("rejects when %s and never calls the service", async (_name, s) => {
    getCurrentSessionMock.mockResolvedValue(s);

    expect(await setScheduleOverrideAction(input)).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(setScheduleOverrideMock).not.toHaveBeenCalled();
  });

  it("returns the schema issue and skips the service on an invalid date", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setScheduleOverrideAction({ ...input, date: "not-a-date" });

    expect(result).toEqual({ success: false, error: "Enter a valid date." });
    expect(setScheduleOverrideMock).not.toHaveBeenCalled();
  });

  it("passes the session artistId and ignores a hostile payload artistId", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setScheduleOverrideAction({ ...input, ...HOSTILE });

    expect(result).toEqual({ success: true });
    expect(setScheduleOverrideMock).toHaveBeenCalledWith({
      artistId: "artist-1",
      date: "2027-05-01",
      availableTimes: ["11:00"],
    });
  });
});

describe("setScheduleOverrideRangeAction", () => {
  const input = {
    startDate: "2027-05-01",
    endDate: "2027-05-03",
    availableTimes: ["11:00"],
  };

  it.each(REJECTED_SESSIONS)("rejects when %s and never calls the service", async (_name, s) => {
    getCurrentSessionMock.mockResolvedValue(s);

    expect(await setScheduleOverrideRangeAction(input)).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(setScheduleOverrideRangeMock).not.toHaveBeenCalled();
  });

  it("returns the schema issue and skips the service when endDate precedes startDate", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setScheduleOverrideRangeAction({
      ...input,
      startDate: "2027-05-04",
    });

    expect(result).toEqual({
      success: false,
      error: "The end date must be on or after the start date.",
    });
    expect(setScheduleOverrideRangeMock).not.toHaveBeenCalled();
  });

  it("passes the session artistId and ignores a hostile payload artistId", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setScheduleOverrideRangeAction({ ...input, ...HOSTILE });

    expect(result).toEqual({ success: true });
    expect(setScheduleOverrideRangeMock).toHaveBeenCalledWith({
      artistId: "artist-1",
      ...input,
    });
  });
});

describe("getWeeklyHoursAction", () => {
  it.each(REJECTED_SESSIONS)("rejects when %s and never queries", async (_name, s) => {
    getCurrentSessionMock.mockResolvedValue(s);

    expect(await getWeeklyHoursAction()).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(prismaMock.artistWeeklyHours.findMany).not.toHaveBeenCalled();
  });

  it("queries the session artist's rows, ignoring a hostile artistId argument", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.artistWeeklyHours.findMany.mockResolvedValue([
      {
        id: "w1",
        artistId: "artist-1",
        dayOfWeek: 1,
        availableTimes: ["11:00"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await getWeeklyHoursAction(HOSTILE);

    expect(prismaMock.artistWeeklyHours.findMany).toHaveBeenCalledWith({
      where: { artistId: "artist-1" },
      orderBy: { dayOfWeek: "asc" },
    });
    expect(result).toEqual({
      success: true,
      hours: [{ dayOfWeek: 1, availableTimes: ["11:00"] }],
    });
  });
});

describe("getScheduleOverridesAction", () => {
  it.each(REJECTED_SESSIONS)("rejects when %s and never queries", async (_name, s) => {
    getCurrentSessionMock.mockResolvedValue(s);

    expect(await getScheduleOverridesAction()).toEqual(NOT_SIGNED_IN_AS_ARTIST);
    expect(prismaMock.artistScheduleOverride.findMany).not.toHaveBeenCalled();
  });

  it("queries the session artist's rows, ignoring a hostile artistId argument", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    prismaMock.artistScheduleOverride.findMany.mockResolvedValue([
      {
        id: "o1",
        artistId: "artist-1",
        date: new Date("2027-05-01T00:00:00.000Z"),
        availableTimes: ["14:00"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await getScheduleOverridesAction(HOSTILE);

    expect(prismaMock.artistScheduleOverride.findMany).toHaveBeenCalledWith({
      where: { artistId: "artist-1" },
      orderBy: { date: "asc" },
    });
    expect(result).toEqual({
      success: true,
      overrides: [{ date: "2027-05-01", availableTimes: ["14:00"] }],
    });
  });
});

describe("getAvailableSlotsAction (intentionally public)", () => {
  it("works signed-out without consulting the session", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    getAvailableSlotsMock.mockResolvedValue([]);

    const result = await getAvailableSlotsAction({
      artistId: "artist-9",
      date: "2027-05-01",
    });

    expect(result).toEqual({ success: true, slots: [] });
    expect(getAvailableSlotsMock).toHaveBeenCalledWith("artist-9", "2027-05-01");
    expect(getCurrentSessionMock).not.toHaveBeenCalled();
  });

  it("returns the schema issue on a malformed date", async () => {
    const result = await getAvailableSlotsAction({ artistId: "artist-9", date: "nope" });

    expect(result).toEqual({ success: false, error: "Enter a valid date." });
    expect(getAvailableSlotsMock).not.toHaveBeenCalled();
  });
});
