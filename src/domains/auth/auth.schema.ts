import { z } from "zod";

import { dateOfBirthSchema, instagramHandleSchema } from "@/lib/clientProfileValidation";
import { normalizedEmailSchema } from "@/lib/email";

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

// Structural validity only -- see services/switchActiveRole.ts for the
// actual check that the account is linked to the target role.
export const switchActiveRoleInputSchema = z.object({
  targetRole: z.enum(["ARTIST", "CLIENT"]),
});
