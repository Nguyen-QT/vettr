import { z } from "zod";

// Real Instagram handle rules: 1-30 chars, letters/digits/periods/
// underscores, and must start and end on an alphanumeric character.
// Shared between booking's guest intake and auth's authenticated
// client-linking flow (CLAUDE.md 26.1) -- keep in sync, do not fork.
export const INSTAGRAM_HANDLE_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9])?$/;

export const instagramHandleSchema = z
  .string()
  .trim()
  .transform((value) => (value.startsWith("@") ? value.slice(1) : value))
  .pipe(
    z
      .string()
      .min(1, "Instagram handle is required.")
      .max(30, "Instagram handle must be 30 characters or fewer.")
      .regex(INSTAGRAM_HANDLE_REGEX, "Enter a valid Instagram handle.")
  );

// Client Onboarding Required Fields (CLAUDE.md 6.2): minimum age to
// submit a booking request or link a client identity, matching typical
// legal minimums for tattoo/piercing services -- confirm the actual
// age-of-consent rules for wherever Vettr operates before launch.
export const MIN_CLIENT_AGE_YEARS = 18;

export const dateOfBirthSchema = z
  .iso.date("Enter a valid date of birth.")
  .refine(
    (value) => {
      const dob = new Date(`${value}T00:00:00`);
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - MIN_CLIENT_AGE_YEARS);
      return dob.getTime() <= cutoff.getTime();
    },
    `You must be at least ${MIN_CLIENT_AGE_YEARS} years old to book.`
  );
