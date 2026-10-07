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

// How many failed login attempts are allowed before a temporary lockout
// is enforced. The lockout is a rolling window, so a user who fails
// to log in 5 times in a row will be locked out for 15 minutes, but
// if they wait 15 minutes and try again, the counter resets.
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_DURATION_MS = 1000 * 60 * 15; // 15 minutes

// How long an emailed verification code (CLAUDE.md 27.3) stays valid.
// Short-lived by design -- the code is only 6 digits, so a tight window
// plus the attempt cap is what makes sha256 (not scrypt) storage safe.
export const EMAIL_VERIFICATION_CODE_EXPIRY_MS = 1000 * 60 * 15; // 15 minutes

// Wrong guesses allowed against one emailed code before it's invalidated
// and a resend is required -- a 6-digit keyspace isn't safe against
// unlimited guessing (CLAUDE.md 27.3).
export const MAX_EMAIL_VERIFICATION_ATTEMPTS = 5;

// Minimum gap between resends for one account (CLAUDE.md 27.3.2.6).
// Also caps Resend calls at one per account per window, including after
// a failed send, so a degraded provider isn't hammered.
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 1000 * 60;

// Per-address send cap for EmailOtpChallenge codes (54.3), counted over
// a window anchored at its first send. Paired with the 5-attempt cap it
// bounds guesses per address per day -- an hourly cap would still allow
// ~600 guesses/day against the 6-digit keyspace.
export const EMAIL_OTP_SEND_WINDOW_MS = 1000 * 60 * 60 * 24; // 24 hours
export const MAX_EMAIL_OTP_SENDS_PER_WINDOW = 10;

// Minimum response time for a sign-in code request (54.3.2.6). An
// eligible address does a lookup + issue + send, an ineligible one only
// the lookup, so every outcome is padded to this floor -- a sleep, not
// dummy work, since nothing local can imitate Resend's latency (27.7).
export const CLIENT_SIGN_IN_CODE_RESPONSE_FLOOR_MS = 1500;

// Send budget for an OTP email, kept below the response floor so a slow
// provider can't push an eligible response past it.
export const EMAIL_OTP_SEND_TIMEOUT_MS = 1000;

// Retry-oriented message for an unexpected DB failure only -- every other
// outcome (ineligible, cooldown, cap, failed send) is the same success.
export const REQUEST_SIGN_IN_CODE_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong sending your sign-in code. Please try again.";

// Deliberately generic -- a wrong, expired, consumed, capped or
// other-purpose code and a valid code for an ineligible account all return
// this, so redeeming an EmailOtpChallenge code can't enumerate accounts or
// code state (54.3.2.7).
export const INVALID_EMAIL_OTP_ERROR_MESSAGE =
  "Incorrect or expired code. Request a new code and try again.";

// Retry-oriented message for an unexpected DB failure only.
export const SIGN_IN_WITH_EMAIL_OTP_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong signing you in. Please try again.";

export const RESEND_VERIFICATION_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong resending the verification code. Please try again.";

// Deliberately generic -- unknown email, wrong code, expired code, a
// locked-out code and an already-verified account all return this, so
// verifyEmailCode can't be used to enumerate accounts or their state.
export const INVALID_VERIFICATION_CODE_ERROR_MESSAGE =
  "Incorrect or expired verification code. Request a new code and try again.";

// Retry-oriented message for an unexpected DB failure only.
export const VERIFY_EMAIL_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong verifying your email. Please try again.";

// signupClient (CLAUDE.md 5.2) only links an *existing* ClientProfile
// found by email -- it never creates one. A client who's never booked
// has nothing to link an account to yet.
export const NO_BOOKING_FOUND_ERROR_MESSAGE =
  "We couldn't find a booking under that email. Submit a booking request first, then create your account.";

// Surfaced when the ClientProfile a signup would link to already has
// an Account -- points them at login instead of a confusing duplicate
// email error at the database level.
export const ACCOUNT_ALREADY_EXISTS_ERROR_MESSAGE =
  "An account already exists for this email. Try logging in instead.";

// linkOrCreateClientProfileForAccount (CLAUDE.md 26.1.2.4) is a one-time
// link -- an account that's already dual-role has nothing left to link.
export const ACCOUNT_ALREADY_HAS_CLIENT_PROFILE_ERROR_MESSAGE =
  "This account is already linked to a client profile.";

// Surfaced when the ClientProfile matched by instagramHandle or email is
// already claimed by a different Account -- never silently steal
// someone else's linked profile.
export const CLIENT_PROFILE_ALREADY_LINKED_ERROR_MESSAGE =
  "That client profile is already linked to another account.";

// Deliberately generic and retry-oriented -- covers both a P2002 unique
// collision (ambiguous: self double-submit vs. a genuine two-user race)
// and any unexpected DB failure. A retry self-corrects via the service's
// existing lookup logic either way.
export const SET_UP_CLIENT_PROFILE_UNEXPECTED_ERROR_MESSAGE =
  "Something went wrong setting up your client profile. Please try again.";

// httpOnly session cookie name (CLAUDE.md 5.1.3) -- its value is a
// Session row's id, the same opaque cuid loginArtist returns.
export const SESSION_COOKIE_NAME = "vettr_session";

// Shared by the route-protection proxy (5.1.4/5.2.3, redirect target
// for an unauthenticated/mismatched request) and logoutAction, which
// picks between the two based on the session's own role (CLAUDE.md
// 5.2.2) rather than hardcoding one.
export const ARTIST_LOGIN_PATH = "/artist/login";
export const CLIENT_LOGIN_PATH = "/client/login";
export const CLIENT_VERIFY_EMAIL_PATH = "/client/verify-email";

// Rows deleted per batched DELETE in pruneExpiredSessions (CLAUDE.md 27.4).
// Bounds each statement's lock/transaction time on a large backlog.
export const SESSION_CLEANUP_BATCH_SIZE = 1000;

// Max batches per sweep invocation -- caps one run at 20,000 deletions;
// a larger backlog finishes on the next scheduled run.
export const SESSION_CLEANUP_MAX_BATCHES = 20;