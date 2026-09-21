// Node's built-in scrypt (no external dependency) -- a salted, adaptive
// hash, the same class of algorithm as bcrypt/argon2, just without
// pulling in a native module for a hand-rolled auth layer (CLAUDE.md
// Phase 5). Params follow Node's own scrypt guidance for interactive
// login (N=16384 via the default cost, 64-byte derived key).
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_SALT_BYTES = 16;

// How long a DB-backed Session stays valid before a login is required
// again. Artists are expected to log in from the same device
// repeatedly, so this favors staying signed in over frequent re-auth.
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Deliberately generic -- never reveals whether the email or the
// password was the wrong part, so a login attempt can't be used to
// enumerate registered accounts.
export const INVALID_CREDENTIALS_ERROR_MESSAGE = "Incorrect email or password.";

// Structural floor only, enforced at signup/provisioning time -- login
// itself never rejects on length (see INVALID_CREDENTIALS_ERROR_MESSAGE).
export const MIN_PASSWORD_LENGTH = 8;

// httpOnly session cookie name (CLAUDE.md 5.1.3) -- its value is a
// Session row's id, the same opaque cuid loginArtist returns.
export const SESSION_COOKIE_NAME = "vettr_session";

// Shared by the route-protection proxy (5.1.4, redirect target for an
// unauthenticated/mismatched request) and logoutAction (5.1.3/5.1.5,
// where a signed-out artist lands).
export const ARTIST_LOGIN_PATH = "/artist/login";
