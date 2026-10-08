import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionWithAccount } from "@/domains/auth/types";
import { expectRedirect } from "@/testUtils/expectRedirect";

import PortalGatePage from "./page";

// next/navigation is deliberately left unmocked so redirect() throws the
// real NEXT_REDIRECT (see expectRedirect). The containers are stubbed so
// the page's own branching is all that runs.
const { getCurrentSessionMock } = vi.hoisted(() => ({
  getCurrentSessionMock: vi.fn(),
}));

vi.mock("@/domains/auth/actions", () => ({
  getCurrentSession: getCurrentSessionMock,
}));
vi.mock("@/domains/auth/components/ClientSignInContainer", () => ({
  ClientSignInContainer: () => null,
}));
vi.mock("@/domains/directory/components/FindArtistContainer", () => ({
  FindArtistContainer: () => null,
}));

const BASE_SESSION: SessionWithAccount = {
  sessionId: "session-1",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  accountId: "account-1",
  role: "CLIENT",
  activeRole: "CLIENT",
  artistId: null,
  clientProfileId: "client-1",
};

function signedIn(overrides: Partial<SessionWithAccount>): void {
  getCurrentSessionMock.mockResolvedValue({ ...BASE_SESSION, ...overrides });
}

describe("PortalGatePage", () => {
  beforeEach(() => {
    getCurrentSessionMock.mockReset();
    getCurrentSessionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects a client session to the client dashboard", async () => {
    signedIn({});

    await expectRedirect(PortalGatePage(), "/client");
  });

  it("redirects a dual-role account in client view to /client, not its artist dashboard", async () => {
    signedIn({ role: "ARTIST", activeRole: "CLIENT", artistId: "artist-1" });

    await expectRedirect(PortalGatePage(), "/client");
  });

  it("redirects an artist session to its own dashboard", async () => {
    signedIn({
      role: "ARTIST",
      activeRole: "ARTIST",
      artistId: "artist-1",
      clientProfileId: null,
    });

    await expectRedirect(PortalGatePage(), "/artist/artist-1");
  });

  it("renders the gate for an artist view with no artistId instead of redirecting", async () => {
    signedIn({ role: "ARTIST", activeRole: "ARTIST", artistId: null });

    const page = await PortalGatePage();

    expect(page.type).toBe("main");
  });

  it("renders the gate for a signed-out visitor", async () => {
    const page = await PortalGatePage();

    expect(page.type).toBe("main");
  });

  it("fails open to the gate when the session lookup throws, logging no raw error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getCurrentSessionMock.mockRejectedValue(new Error("connection refused"));

    const page = await PortalGatePage();

    expect(page.type).toBe("main");
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("renderPortalGate failed", {
      reason: "SESSION_LOOKUP_FAILED",
    });
  });

  it("rethrows Next control-flow errors from the session lookup instead of swallowing them", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getCurrentSessionMock.mockImplementation(async () => redirect("/elsewhere"));

    await expectRedirect(PortalGatePage(), "/elsewhere");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
