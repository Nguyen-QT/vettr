"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { loginInputSchema } from "./auth.schema";
import { ARTIST_LOGIN_PATH, SESSION_COOKIE_NAME } from "./constants";
import { deleteSession } from "./services/deleteSession";
import { loginArtist } from "./services/loginArtist";

// Never includes the raw sessionId -- that only ever lives in the
// httpOnly cookie set below, not in anything sent back to client code.
export type LoginActionResult =
  | { success: true; artistId: string }
  | { success: false; error: string };

// Controller/Action boundary (CLAUDE.md 5.1.3): validates structurally,
// delegates to loginArtist for the actual credential check, then sets
// the httpOnly session cookie on success. The route-protection
// middleware (5.1.4) is what actually enforces the session server-side
// -- this cookie is just how the session id gets to the browser.
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

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, result.sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: result.expiresAt,
  });

  return { success: true, artistId: result.artistId };
}

// Controller/Action boundary (CLAUDE.md 5.1.3): clears the session
// cookie and revokes the underlying Session row, so a copy of the old
// cookie value (if one leaked) can't still be used. Bound directly to
// the dashboard layout's logout <form> (5.1.5), so it redirects itself
// rather than returning a result for a client hook to act on.
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect(ARTIST_LOGIN_PATH);
}
