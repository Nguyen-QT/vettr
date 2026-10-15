import { z } from "zod";

import { dateOfBirthSchema, instagramHandleSchema } from "@/lib/clientProfileValidation";
import { normalizedEmailSchema } from "@/lib/email";

import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  MAX_ARTIST_PASSWORD_LENGTH,
  MIN_ARTIST_PASSWORD_LENGTH,
} from "./constants";

// Structural validity only -- see services/loginArtist.ts for the
// actual credential check against the database. Password has no
// minimum length here: a login attempt validates against whatever was
// actually set at provisioning time, not today's policy floor.
export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required."),
});

// Structural validity only -- see services/linkOrCreateClientProfileForAccount.ts for the
// actual lookup and linking/creation. This is a new flow that only
// applies to existing logged-in artists, so no email or password is
// needed here -- the account is already known from the session.
// instagramHandle and dateOfBirth are reused from the shared validation module, not redefined.
export const setUpClientProfileInputSchema = z.object({
  instagramHandle: instagramHandleSchema,
  phone: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
});

// Structural validity only -- see services/requestClientSignInCode.ts for
// the eligibility check. The email is normalised here and again in the
// service; a malformed one can't belong to an account, so rejecting it
// before the service's response floor reveals nothing (54.3.3.1).
export const requestClientSignInCodeInputSchema = z.object({
  email: normalizedEmailSchema,
});

// Structural validity only -- see services/signInClientWithEmailOtp.ts for
// the actual code check. No password (clients sign in by code alone); the
// code stays a string so leading zeros survive.
export const verifyClientSignInCodeInputSchema = z.object({
  email: normalizedEmailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

// The password policy for a NEW artist password (71.1.3.1): length bounds
// only, taken verbatim (no trim). One owner for the rule, shared by the
// action input and the form schema below.
const artistNewPasswordSchema = z
  .string()
  .min(
    MIN_ARTIST_PASSWORD_LENGTH,
    `Password must be at least ${MIN_ARTIST_PASSWORD_LENGTH} characters.`
  )
  .max(
    MAX_ARTIST_PASSWORD_LENGTH,
    `Password must be at most ${MAX_ARTIST_PASSWORD_LENGTH} characters.`
  );

// Structural validity only -- see services/requestArtistPasswordReset.ts for
// the eligibility check. A malformed email can't belong to an account, so
// rejecting it before the service's response floor reveals nothing (71.1.3.1).
export const requestArtistPasswordResetInputSchema = z.object({
  email: normalizedEmailSchema,
});

// Structural validity only -- see services/resetArtistPassword.ts for the
// actual link check. The token is 32 random bytes as base64url (43 chars). A
// malformed one gets the same copy as an unknown or expired link, so the
// shape check adds no oracle.
export const resetArtistPasswordInputSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE),
  newPassword: artistNewPasswordSchema,
});

// Client-side form shape for the reset page (71.1.5.2's zodResolver). No
// token: it comes from the URL, not a field.
export const artistPasswordResetFormSchema = z
  .object({
    newPassword: artistNewPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

// Structural validity only -- see services/switchActiveRole.ts for the
// actual check that the account is linked to the target role.
export const switchActiveRoleInputSchema = z.object({
  targetRole: z.enum(["ARTIST", "CLIENT"]),
});
