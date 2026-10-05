import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";

const {
  getCurrentSessionMock,
  createDepositPaymentIntentMock,
  setArtistDepositSettingsMock,
  getArtistDepositSettingsMock,
  addBillingAddonMock,
  removeBillingAddonMock,
  finalizeCheckoutMock,
  createConnectOnboardingLinkMock,
  getArtistConnectStatusMock,
} = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
  createDepositPaymentIntentMock: vi.fn(),
  setArtistDepositSettingsMock: vi.fn(),
  getArtistDepositSettingsMock: vi.fn(),
  addBillingAddonMock: vi.fn(),
  removeBillingAddonMock: vi.fn(),
  finalizeCheckoutMock: vi.fn(),
  createConnectOnboardingLinkMock: vi.fn(),
  getArtistConnectStatusMock: vi.fn(),
}));

// Cross-module call, so a plain module mock intercepts it (unlike auth's
// own tests, which need authSessionMock.ts).
vi.mock("@/domains/auth/actions", () => ({
  getCurrentSession: getCurrentSessionMock,
}));
vi.mock("./services/createDepositPaymentIntent", () => ({
  createDepositPaymentIntent: createDepositPaymentIntentMock,
}));
vi.mock("./services/setArtistDepositSettings", () => ({
  setArtistDepositSettings: setArtistDepositSettingsMock,
}));
vi.mock("./services/getArtistDepositSettings", () => ({
  getArtistDepositSettings: getArtistDepositSettingsMock,
}));
vi.mock("./services/addBillingAddon", () => ({ addBillingAddon: addBillingAddonMock }));
vi.mock("./services/removeBillingAddon", () => ({
  removeBillingAddon: removeBillingAddonMock,
}));
vi.mock("./services/finalizeCheckout", () => ({ finalizeCheckout: finalizeCheckoutMock }));
vi.mock("./services/createConnectOnboardingLink", () => ({
  createConnectOnboardingLink: createConnectOnboardingLinkMock,
}));
vi.mock("./services/getArtistConnectStatus", () => ({
  getArtistConnectStatus: getArtistConnectStatusMock,
}));

import {
  addBillingAddonAction,
  createConnectOnboardingLinkAction,
  createDepositPaymentIntentAction,
  finalizeCheckoutAction,
  getArtistConnectStatusAction,
  getArtistDepositSettingsAction,
  removeBillingAddonAction,
  setArtistDepositSettingsAction,
} from "./actions";
import type { ArtistConnectStatus, ArtistDepositSettings } from "./types";

const NOT_SIGNED_IN_AS_CLIENT = {
  success: false,
  error: "You must be signed in as a client to do that.",
};
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

const CLIENT_SESSION = session({ clientProfileId: "client-1" });
const ARTIST_SESSION = session({
  role: "ARTIST",
  activeRole: "ARTIST",
  artistId: "artist-1",
});

// Every way requireArtistId() must refuse: no session, a dual-role account
// currently acting as a client, and an ARTIST session with no artist id.
const REJECTED_ARTIST_SESSIONS: Array<[string, SessionWithAccount | null]> = [
  ["signed out", null],
  [
    "activeRole CLIENT despite holding an artistId",
    session({ role: "ARTIST", activeRole: "CLIENT", artistId: "artist-1" }),
  ],
  ["activeRole ARTIST with no artistId", session({ role: "ARTIST", activeRole: "ARTIST" })],
];

const REJECTED_CLIENT_SESSIONS: Array<[string, SessionWithAccount | null]> = [
  ["signed out", null],
  [
    "activeRole ARTIST despite holding a clientProfileId",
    session({
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: "client-1",
    }),
  ],
  ["activeRole CLIENT with no clientProfileId", session({})],
];

// Identity fields an attacker might smuggle into a form payload -- the
// schemas must strip them so only the session-derived id reaches the
// service (validation.md §2).
const HOSTILE_IDENTITY = {
  artistId: "attacker-artist",
  clientProfileId: "attacker-client",
  accountId: "attacker-account",
  role: "ARTIST",
  userId: "attacker-user",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createDepositPaymentIntentAction", () => {
  it.each(REJECTED_CLIENT_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await createDepositPaymentIntentAction("request-1");

      expect(result).toEqual(NOT_SIGNED_IN_AS_CLIENT);
      expect(createDepositPaymentIntentMock).not.toHaveBeenCalled();
    }
  );

  it("passes the session clientProfileId and passes the result through", async () => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
    createDepositPaymentIntentMock.mockResolvedValue({
      success: true,
      clientSecret: "secret-1",
    });

    const result = await createDepositPaymentIntentAction("request-1");

    expect(createDepositPaymentIntentMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      clientProfileId: "client-1",
    });
    expect(result).toEqual({ success: true, clientSecret: "secret-1" });
  });

  it("passes a service failure through", async () => {
    getCurrentSessionMock.mockResolvedValue(CLIENT_SESSION);
    createDepositPaymentIntentMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await createDepositPaymentIntentAction("request-1");

    expect(result).toEqual({ success: false, error: "nope" });
  });
});

describe("setArtistDepositSettingsAction", () => {
  const validInput = { tier: "TIER_3", depositAmount: 50 };

  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await setArtistDepositSettingsAction(validInput);

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(setArtistDepositSettingsMock).not.toHaveBeenCalled();
    }
  );

  it("checks the session before parsing, so a signed-out caller gets the auth error for bad input", async () => {
    getCurrentSessionMock.mockResolvedValue(null);

    const result = await setArtistDepositSettingsAction({ depositAmount: -1 });

    expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
  });

  it.each<[string, unknown]>([
    ["a non-object payload", null],
    ["an unknown tier", { tier: "TIER_9", depositAmount: 50 }],
    ["a missing depositAmount", { tier: "TIER_3" }],
    ["a string depositAmount", { tier: "TIER_3", depositAmount: "50" }],
  ])("rejects %s without calling the service", async (_label, input) => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setArtistDepositSettingsAction(input);

    expect(result.success).toBe(false);
    expect(setArtistDepositSettingsMock).not.toHaveBeenCalled();
  });

  it("surfaces the schema's own message for an amount below the minimum", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setArtistDepositSettingsAction({
      tier: "TIER_3",
      depositAmount: 0,
    });

    expect(result).toEqual({
      success: false,
      error: "The deposit amount must be at least 1.",
    });
    expect(setArtistDepositSettingsMock).not.toHaveBeenCalled();
  });

  it("accepts the minimum amount exactly", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setArtistDepositSettingsAction({
      tier: "FREESTYLE",
      depositAmount: 1,
    });

    expect(result).toEqual({ success: true });
    expect(setArtistDepositSettingsMock).toHaveBeenCalledWith({
      artistId: "artist-1",
      tier: "FREESTYLE",
      depositAmount: 1,
    });
  });

  it("ignores hostile identity fields and passes only the session artistId", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await setArtistDepositSettingsAction({
      ...validInput,
      ...HOSTILE_IDENTITY,
    });

    expect(result).toEqual({ success: true });
    expect(setArtistDepositSettingsMock).toHaveBeenCalledTimes(1);
    expect(setArtistDepositSettingsMock).toHaveBeenCalledWith({
      artistId: "artist-1",
      tier: "TIER_3",
      depositAmount: 50,
    });
  });
});

describe("getArtistDepositSettingsAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await getArtistDepositSettingsAction();

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(getArtistDepositSettingsMock).not.toHaveBeenCalled();
    }
  );

  it("reads the session artist's settings and wraps them in a success result", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    const settings: ArtistDepositSettings = {
      TIER_2: 25,
      TIER_3: 50,
      TIER_4: null,
      FREESTYLE: null,
    };
    getArtistDepositSettingsMock.mockResolvedValue(settings);

    const result = await getArtistDepositSettingsAction();

    expect(getArtistDepositSettingsMock).toHaveBeenCalledWith("artist-1");
    expect(result).toEqual({ success: true, settings });
  });
});

describe("addBillingAddonAction", () => {
  const validInput = { label: "Extra shading", price: 40 };

  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await addBillingAddonAction("request-1", validInput);

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(addBillingAddonMock).not.toHaveBeenCalled();
    }
  );

  it.each<[string, unknown]>([
    ["a non-object payload", null],
    ["a whitespace-only label", { label: "   ", price: 40 }],
    ["a label over 100 characters", { label: "x".repeat(101), price: 40 }],
    ["a string price", { label: "Extra shading", price: "40" }],
  ])("rejects %s without calling the service", async (_label, input) => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await addBillingAddonAction("request-1", input);

    expect(result.success).toBe(false);
    expect(addBillingAddonMock).not.toHaveBeenCalled();
  });

  it("surfaces the schema's own message for a price below the minimum", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);

    const result = await addBillingAddonAction("request-1", {
      label: "Extra shading",
      price: 0,
    });

    expect(result).toEqual({
      success: false,
      error: "The addon price must be at least 1.",
    });
    expect(addBillingAddonMock).not.toHaveBeenCalled();
  });

  it("trims the label and passes the session artistId, ignoring hostile identity fields", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    addBillingAddonMock.mockResolvedValue({ success: true });

    const result = await addBillingAddonAction("request-1", {
      label: "  Extra shading  ",
      price: 40,
      bookingRequestId: "attacker-request",
      ...HOSTILE_IDENTITY,
    });

    expect(addBillingAddonMock).toHaveBeenCalledTimes(1);
    expect(addBillingAddonMock).toHaveBeenCalledWith({
      bookingRequestId: "request-1",
      artistId: "artist-1",
      label: "Extra shading",
      price: 40,
    });
    expect(result).toEqual({ success: true });
  });

  it("passes a service failure through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    addBillingAddonMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await addBillingAddonAction("request-1", validInput);

    expect(result).toEqual({ success: false, error: "nope" });
  });
});

describe("removeBillingAddonAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await removeBillingAddonAction("addon-1");

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(removeBillingAddonMock).not.toHaveBeenCalled();
    }
  );

  it("passes the session artistId and passes the result through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    removeBillingAddonMock.mockResolvedValue({ success: true });

    const result = await removeBillingAddonAction("addon-1");

    expect(removeBillingAddonMock).toHaveBeenCalledWith({
      addonId: "addon-1",
      artistId: "artist-1",
    });
    expect(result).toEqual({ success: true });
  });

  it("passes a service failure through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    removeBillingAddonMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await removeBillingAddonAction("addon-1");

    expect(result).toEqual({ success: false, error: "nope" });
  });
});

describe("finalizeCheckoutAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await finalizeCheckoutAction("request-1");

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(finalizeCheckoutMock).not.toHaveBeenCalled();
    }
  );

  it("passes the request id and session artistId and passes the result through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    finalizeCheckoutMock.mockResolvedValue({ success: true });

    const result = await finalizeCheckoutAction("request-1");

    expect(finalizeCheckoutMock).toHaveBeenCalledWith("request-1", "artist-1");
    expect(result).toEqual({ success: true });
  });

  it("passes a service failure through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    finalizeCheckoutMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await finalizeCheckoutAction("request-1");

    expect(result).toEqual({ success: false, error: "nope" });
  });
});

describe("createConnectOnboardingLinkAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await createConnectOnboardingLinkAction();

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(createConnectOnboardingLinkMock).not.toHaveBeenCalled();
    }
  );

  it("passes the session artistId and passes the result through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    createConnectOnboardingLinkMock.mockResolvedValue({
      success: true,
      url: "https://connect.stripe.com/setup/abc",
    });

    const result = await createConnectOnboardingLinkAction();

    expect(createConnectOnboardingLinkMock).toHaveBeenCalledWith("artist-1");
    expect(result).toEqual({
      success: true,
      url: "https://connect.stripe.com/setup/abc",
    });
  });

  it("passes a service failure through", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    createConnectOnboardingLinkMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await createConnectOnboardingLinkAction();

    expect(result).toEqual({ success: false, error: "nope" });
  });
});

describe("getArtistConnectStatusAction", () => {
  it.each(REJECTED_ARTIST_SESSIONS)(
    "rejects when %s without calling the service",
    async (_label, current) => {
      getCurrentSessionMock.mockResolvedValue(current);

      const result = await getArtistConnectStatusAction();

      expect(result).toEqual(NOT_SIGNED_IN_AS_ARTIST);
      expect(getArtistConnectStatusMock).not.toHaveBeenCalled();
    }
  );

  it("reads the session artist's status and wraps it in a success result", async () => {
    getCurrentSessionMock.mockResolvedValue(ARTIST_SESSION);
    const status: ArtistConnectStatus = {
      connected: true,
      chargesEnabled: true,
      payoutsEnabled: false,
    };
    getArtistConnectStatusMock.mockResolvedValue(status);

    const result = await getArtistConnectStatusAction();

    expect(getArtistConnectStatusMock).toHaveBeenCalledWith("artist-1");
    expect(result).toEqual({ success: true, status });
  });
});
