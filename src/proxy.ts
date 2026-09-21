import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { ARTIST_LOGIN_PATH, SESSION_COOKIE_NAME } from "@/domains/auth/constants";
import { getSessionWithAccount } from "@/domains/auth/services/getSessionWithAccount";

// Named `proxy.ts` (Next 16's rename of `middleware.ts`) specifically
// because it always runs on the Node.js runtime, unlike middleware's
// historical Edge default -- this file calls Prisma (via
// getSessionWithAccount), which needs the `pg` driver adapter and
// can't run on Edge.

// Route protection for the artist dashboard (CLAUDE.md 5.1.4): before
// this, any URL with a guessable/known artistId worked -- there was no
// access control on /artist/[artistId]/* at all. A request must carry
// a valid, non-expired session for an ARTIST account whose own
// artistId matches the one in the URL; anything else is redirected to
// the login page (5.1.5), with the original destination preserved so
// login can send them back.
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === ARTIST_LOGIN_PATH) {
    return NextResponse.next();
  }

  const artistId = pathname.match(/^\/artist\/([^/]+)/)?.[1];
  if (!artistId) {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionId ? await getSessionWithAccount(sessionId) : null;

  if (!session || session.role !== "ARTIST" || session.artistId !== artistId) {
    const loginUrl = new URL(ARTIST_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/artist/:path*",
};
