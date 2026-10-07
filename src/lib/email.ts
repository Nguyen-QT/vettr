import { z } from "zod";

// Email address normalisation. Single app-side owner of the email rules;
// shared by every OTP / sign-in / booking-code path (architecture.md 4.B)
// -- do not fork. Every write keyed on an email must go through this so
// the unique index on EmailOtpChallenge.email sees one row per inbox.

// RFC 5321 forward-path limit. z.email() has no length cap of its own.
export const EMAIL_MAX_LENGTH = 254;

// One message for every failure so the response never says which rule
// tripped.
const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";

// Pure and never throws: trim, lowercase. No provider-specific folding
// (Gmail dots, "+tag") -- identity is the exact inbox the code reaches.
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Validates after normalising, so the output is always a valid, lowercase,
// ASCII-only address -- JS toLowerCase() and Postgres lower() agree on it,
// which keeps EmailOtpChallenge_email_lowercase_check in
// prisma/migrations/20261007001623_add_email_otp_challenge satisfied.
export const normalizedEmailSchema = z
  .string()
  .transform(normalizeEmail)
  .pipe(
    z
      .email(INVALID_EMAIL_MESSAGE)
      .max(EMAIL_MAX_LENGTH, INVALID_EMAIL_MESSAGE)
  );
