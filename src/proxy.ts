import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  ARTIST_FORGOT_PASSWORD_PATH,
  ARTIST_LOGIN_PATH,
  ARTIST_RESET_PASSWORD_PATH,
  CLIENT_LOGIN_PATH,
  SESSION_COOKIE_NAME,
} from "@/domains/auth/constants";
import { getSessionWithAccount } from "@/domains/auth/services/getSessionWithAccount";
import type { SessionWithAccount } from "@/domains/auth/types";
import {
  buildContentSecurityPolicy,
  createCspNonce,
  CSP_HEADER_NAME,
  NONCE_REQUEST_HEADER,
} from "@/lib/contentSecurityPolicy";

// Named `proxy.ts` (Next 16's rename of `middleware.ts`) specifically
// because it always runs on the Node.js runtime, unlike middleware's
// historical Edge default -- this file calls Prisma (via
// getSessionWithAccount), which needs the `pg` driver adapter and
// can't run on Edge.

// The client sign-in page is the only public path under /client --
// everything else requires a session (CLAUDE.md 5.2.3). Clients are
// passwordless (54.8), so there is no signup or verify-email page.
const PUBLIC_CLIENT_PATHS = [CLIENT_LOGIN_PATH];

// Login plus the password-reset pair (71.1.6.1) are the only public paths
// under /artist -- any other /artist/<x> is treated as an artist id below. A
// locked-out artist has no session, so the reset pages must be reachable
// without one. Matched on pathname, so a link's ?token= never matters.
const PUBLIC_ARTIST_PATHS = [
  ARTIST_LOGIN_PATH,
  ARTIST_FORGOT_PASSWORD_PATH,
  ARTIST_RESET_PASSWORD_PATH,
];

async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionWithAccount | null> {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return sessionId ? getSessionWithAccount(sessionId) : null;
}

function redirectToLogin(request: NextRequest, loginPath: string) {
  const loginUrl = new URL(loginPath, request.url);
  loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// Lets the request through with a fresh nonce CSP (53.4.3.2). The CSP header
// on the forwarded request is where Next reads the nonce for its own scripts;
// `x-nonce` is for the root layout's theme script. The nonce is per request
// and never cached or logged. Redirects skip this: they render no document.
function nextWithCsp(request: NextRequest): NextResponse {
  const nonce = createCspNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_REQUEST_HEADER, nonce);
  requestHeaders.set(CSP_HEADER_NAME, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER_NAME, csp);
  return response;
}

// Runs on every page to set the nonce CSP (53.4.3.2), and also does route
// protection for the artist dashboard (CLAUDE.md 5.1.4) and the client
// dashboard (5.2.3). A request must carry a valid, non-expired session for
// the matching role; anything else is redirected to that role's login page,
// with the original destination preserved so login can send them back. The
// artist check also requires the session's own artistId to match the one in
// the URL -- there was no access control on /artist/[artistId]/* at all
// before 5.1.4, any guessable/known artistId worked. The client check has no
// URL param to match against: client routes are session-derived (/client,
// not /client/[clientProfileId]), so any valid CLIENT session is enough.
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ARTIST_PATHS.includes(pathname) || PUBLIC_CLIENT_PATHS.includes(pathname)) {
    return nextWithCsp(request);
  }

  const artistId = pathname.match(/^\/artist\/([^/]+)/)?.[1];
  if (artistId) {
    const session = await getSessionFromRequest(request);
    if (!session || session.activeRole !== "ARTIST" || session.artistId !== artistId) {
      return redirectToLogin(request, ARTIST_LOGIN_PATH);
    }
    return nextWithCsp(request);
  }

  // Exactly what the old `/client/:path*` matcher covered: now that every
  // page comes through here, a stray `/clients` must not be sent to login.
  if (pathname === "/client" || pathname.startsWith("/client/")) {
    const session = await getSessionFromRequest(request);
    if (!session || session.activeRole !== "CLIENT") {
      return redirectToLogin(request, CLIENT_LOGIN_PATH);
    }
    return nextWithCsp(request);
  }

  return nextWithCsp(request);
}

// Every page, so each document gets a nonce. API routes, static assets and
// image optimisation render no HTML. There is deliberately no `missing`
// prefetch exclusion: it would also skip the auth check on prefetched
// /artist and /client routes.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
