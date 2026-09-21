// Pure domain contracts for the auth bounded context. Deliberately
// standalone TypeScript -- no z.infer, no import from auth.schema.ts --
// kept structurally in sync with auth.schema.ts by hand, same
// convention as intake/scheduling.

export interface LoginInput {
  email: string;
  password: string;
}

// sessionId doubles as the opaque session-cookie value -- Session rows
// are keyed by an unguessable cuid, so no separate token field is
// needed (CLAUDE.md 5.1.2).
export type LoginResult =
  | { success: true; sessionId: string; expiresAt: Date; artistId: string }
  | { success: false; error: string };

export interface SessionWithAccount {
  sessionId: string;
  expiresAt: Date;
  accountId: string;
  role: "ARTIST" | "CLIENT";
  artistId: string | null;
  clientProfileId: string | null;
}
