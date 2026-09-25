"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loginInputSchema, signupInputSchema } from "./auth.schema";
import {
  ARTIST_LOGIN_PATH,
  CLIENT_LOGIN_PATH,
  SESSION_COOKIE_NAME,
} from "./constants";
import { deleteSession } from "./services/deleteSession";
import { getSessionWithAccount } from "./services/getSessionWithAccount";
import { loginArtist } from "./services/loginArtist";
import { loginClient } from "./services/loginClient";
import { signupClient } from "./services/signupClient";
import type { SessionWithAccount } from "./types";

// Never includes the raw sessionId -- that only ever lives in the
// httpOnly cookie set below, not in anything sent back to client code.
export type LoginActionResult =
  | { success: true; artistId: string }
  | { success: false; error: string };

export type ClientAuthActionResult =
  | { success: true; clientProfileId: string }
  | { success: false; error: string };

async function setSessionCookie(sessionId: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

// Controller/Action boundary (CLAUDE.md 5.1.3): validates structurally,
// delegates to loginArtist for the actual credential check, then sets
// the httpOnly session cookie on success. The route-protection proxy
// (5.1.4) is what actually enforces the session server-side -- this
// cookie is just how the session id gets to the browser.
export async function loginAction(input: unknown): Promise<LoginActionResult> {
  const parsed = loginInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid login request.",
    };
  }

  const result = await loginArtist(parsed.data);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  await setSessionCookie(result.sessionId, result.expiresAt);
  return { success: true, artistId: result.artistId };
}

// Controller/Action boundary (CLAUDE.md 5.2.2): validates structurally
// (enforcing the signup password-length floor, unlike login), delegates
// to signupClient, then sets the session cookie on success -- same
// shape as loginAction above.
export async function signupClientAction(
  input: unknown
): Promise<ClientAuthActionResult> {
  const parsed = signupInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid signup request.",
    };
  }

  const result = await signupClient(parsed.data);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  await setSessionCookie(result.sessionId, result.expiresAt);
  return { success: true, clientProfileId: result.clientProfileId };
}

// Controller/Action boundary (CLAUDE.md 5.2.2): mirrors loginAction,
// delegating to loginClient instead of loginArtist.
export async function loginClientAction(
  input: unknown
): Promise<ClientAuthActionResult> {
  const parsed = loginInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid login request.",
    };
  }

  const result = await loginClient(parsed.data);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  await setSessionCookie(result.sessionId, result.expiresAt);
  return { success: true, clientProfileId: result.clientProfileId };
}

// Controller/Action boundary (CLAUDE.md 5.1.3, generalized 5.2.2):
// clears the session cookie and revokes the underlying Session row, so
// a copy of the old cookie value (if one leaked) can't still be used.
// Bound directly to a logout <form> (artist dashboard layout, 5.1.5;
// client dashboard, 5.2.4), so it redirects itself rather than
// returning a result for a client hook to act on -- looks up the
// session's activeRole first (not the account's home role, since a
// dual-role account may be logging out of a session in either role) so
// an artist session lands on /artist/login and a client session lands
// on /client/login, rather than one hardcoded path.
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionId ? await getSessionWithAccount(sessionId) : null;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect(
    session?.activeRole === "CLIENT" ? CLIENT_LOGIN_PATH : ARTIST_LOGIN_PATH
  );
}

// Controller/Action boundary (CLAUDE.md 5.2.4): reads the session
// cookie server-side for a page/layout to use -- the client dashboard
// is session-derived (/client, no clientProfileId URL param), so this
// is how it finds out which client is asking. The route-protection
// proxy already guarantees a valid CLIENT session reached this far;
// this just hands that session's details to the page itself.
export async function getCurrentSession(): Promise<SessionWithAccount | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return sessionId ? getSessionWithAccount(sessionId) : null;
}
