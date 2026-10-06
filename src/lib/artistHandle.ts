import { z } from "zod";

// Artist public handle (`/@handle`). Single app-side owner of the handle
// rules; shared by directory, routing and future handle editing
// (architecture.md 4.B) -- do not fork.
export const ARTIST_HANDLE_MAX_LENGTH = 30;

// Must stay identical to Artist_handle_format_check in
// prisma/migrations/20261006182220_add_artist_handle.
export const ARTIST_HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9])?$/;

// Must stay identical to the reserved-word guard in the same migration.
export const RESERVED_ARTIST_HANDLES: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "artist",
  "artists",
  "at",
  "book",
  "client",
  "help",
  "login",
  "logout",
  "settings",
  "signup",
  "static",
  "support",
  "vettr",
  "www",
  "_next",
]);

// `/@name.rsc` would collide with Next's RSC payload paths.
const RESERVED_ARTIST_HANDLE_SUFFIX = ".rsc";

// Pure and never throws: trim, strip a single leading "@", lowercase.
export function normalizeArtistHandle(raw: string): string {
  const trimmed = raw.trim();
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return withoutAt.toLowerCase();
}

// Expects an already-normalised handle.
export function isReservedArtistHandle(handle: string): boolean {
  return (
    RESERVED_ARTIST_HANDLES.has(handle) ||
    handle.endsWith(RESERVED_ARTIST_HANDLE_SUFFIX)
  );
}

export const artistHandleSchema = z
  .string()
  .transform(normalizeArtistHandle)
  .pipe(
    z
      .string()
      .min(1, "Handle is required.")
      .max(
        ARTIST_HANDLE_MAX_LENGTH,
        `Handle must be ${ARTIST_HANDLE_MAX_LENGTH} characters or fewer.`
      )
      .regex(ARTIST_HANDLE_REGEX, "Enter a valid handle.")
      .refine(
        (handle) => !isReservedArtistHandle(handle),
        "That handle isn't available."
      )
  );
