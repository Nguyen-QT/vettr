import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "./constants";

// Deliberately not a "use server" module (54.5.3.2): every export from one
// becomes a callable server action endpoint, and this one would let any
// browser set an arbitrary session cookie. Server-side callers only -- the
// auth actions, and booking's code-gated submit actions (54.5.3.4).
export async function setSessionCookie(
  sessionId: string,
  expiresAt: Date
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
