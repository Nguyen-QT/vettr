import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "@/domains/auth/constants";
import type { SessionWithAccount } from "@/domains/auth/types";
import { CSP_HEADER_NAME, NONCE_REQUEST_HEADER } from "@/lib/contentSecurityPolicy";

import proxy, { config } from "./proxy";

const { getSessionWithAccountMock } = vi.hoisted(() => ({
  getSessionWithAccountMock: vi.fn(),
}));

vi.mock("@/domains/auth/services/getSessionWithAccount", () => ({
  getSessionWithAccount: getSessionWithAccountMock,
}));

const ORIGIN = "http://localhost:3000";
const SESSION_ID = "session-1";

const ARTIST_SESSION: SessionWithAccount = {
  sessionId: SESSION_ID,
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  accountId: "account-1",
  role: "ARTIST",
  activeRole: "ARTIST",
  artistId: "a1",
  clientProfileId: null,
};

const CLIENT_SESSION: SessionWithAccount = {
  ...ARTIST_SESSION,
  role: "CLIENT",
  activeRole: "CLIENT",
  artistId: null,
  clientProfileId: "client-1",
};

function requestFor(pathname: string, { signedIn = false } = {}): NextRequest {
  const headers = signedIn ? { cookie: `${SESSION_COOKIE_NAME}=${SESSION_ID}` } : undefined;
  return new NextRequest(`${ORIGIN}${pathname}`, { headers });
}

function cspOf(response: NextResponse): string | null {
  return response.headers.get(CSP_HEADER_NAME);
}

function nonceOf(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

// NextResponse.next({ request: { headers } }) forwards each request header
// to Next as `x-middleware-request-<name>` on the response.
function forwardedRequestHeader(response: NextResponse, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name.toLowerCase()}`);
}

function expectPassThroughWithCsp(response: NextResponse): void {
  expect(getRedirectUrl(response)).toBeNull();
  const csp = cspOf(response);
  expect(csp).toContain("'strict-dynamic'");
  expect(nonceOf(csp)).toBeDefined();
}

describe("proxy", () => {
  beforeEach(() => {
    getSessionWithAccountMock.mockReset();
  });

  describe("nonce CSP", () => {
    it("gives a public page the CSP and forwards the same nonce to Next", async () => {
      const response = await proxy(requestFor("/"));

      expectPassThroughWithCsp(response);
      const csp = cspOf(response);
      expect(forwardedRequestHeader(response, NONCE_REQUEST_HEADER)).toBe(nonceOf(csp));
      expect(forwardedRequestHeader(response, CSP_HEADER_NAME)).toBe(csp);
      expect(getSessionWithAccountMock).not.toHaveBeenCalled();
    });

    it("gives two requests different nonces", async () => {
      const first = await proxy(requestFor("/"));
      const second = await proxy(requestFor("/"));

      expect(nonceOf(cspOf(first))).not.toBe(nonceOf(cspOf(second)));
    });

    it("gives /artist/login the CSP without a session lookup", async () => {
      const response = await proxy(requestFor("/artist/login"));

      expectPassThroughWithCsp(response);
      expect(getSessionWithAccountMock).not.toHaveBeenCalled();
    });
  });

  describe("artist routes", () => {
    it("redirects a signed-out request to login with redirectTo and no CSP", async () => {
      const response = await proxy(requestFor("/artist/a1"));

      expect(getRedirectUrl(response)).toBe(
        `${ORIGIN}/artist/login?redirectTo=%2Fartist%2Fa1`
      );
      expect(cspOf(response)).toBeNull();
    });

    it("lets the owning artist through with the CSP", async () => {
      getSessionWithAccountMock.mockResolvedValue(ARTIST_SESSION);

      const response = await proxy(requestFor("/artist/a1", { signedIn: true }));

      expectPassThroughWithCsp(response);
      expect(getSessionWithAccountMock).toHaveBeenCalledWith(SESSION_ID);
    });

    it("redirects another artist's session to login", async () => {
      getSessionWithAccountMock.mockResolvedValue({ ...ARTIST_SESSION, artistId: "a2" });

      const response = await proxy(requestFor("/artist/a1", { signedIn: true }));

      expect(getRedirectUrl(response)).toBe(
        `${ORIGIN}/artist/login?redirectTo=%2Fartist%2Fa1`
      );
    });
  });

  describe("client routes", () => {
    it("lets a CLIENT session through /client with the CSP", async () => {
      getSessionWithAccountMock.mockResolvedValue(CLIENT_SESSION);

      const response = await proxy(requestFor("/client", { signedIn: true }));

      expectPassThroughWithCsp(response);
    });

    it("redirects an ARTIST session on /client to client login", async () => {
      getSessionWithAccountMock.mockResolvedValue(ARTIST_SESSION);

      const response = await proxy(requestFor("/client", { signedIn: true }));

      expect(getRedirectUrl(response)).toBe(
        `${ORIGIN}/client/login?redirectTo=%2Fclient`
      );
    });

    it("passes a signed-out /clients through with the CSP and no session lookup", async () => {
      const response = await proxy(requestFor("/clients"));

      expectPassThroughWithCsp(response);
      expect(getSessionWithAccountMock).not.toHaveBeenCalled();
    });
  });

  describe("matcher", () => {
    it.each(["/", "/@handle", "/artist/a1", "/client"])("runs on %s", (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    });

    it.each([
      "/api/uploadthing",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/favicon.ico",
    ])("skips %s", (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    });
  });
});
