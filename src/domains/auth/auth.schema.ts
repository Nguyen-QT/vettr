import { z } from "zod";

import { dateOfBirthSchema, instagramHandleSchema } from "@/lib/clientProfileValidation";
import { MIN_PASSWORD_LENGTH } from "./constants";

// Structural validity only -- see services/loginArtist.ts for the
// actual credential check against the database. Password has no
// minimum length here: a login attempt validates against whatever was
// actually set at provisioning time, not today's policy floor.
export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required."),
});

// Structural validity only -- see services/signupClient.ts for the
// existing-ClientProfile lookup. Unlike login, signup enforces the
// password policy floor since this is where a new credential is set.
export const signupInputSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    ),
});

// Structural validity only -- see services/linkOrCreateClientProfileForAccount.ts for the
// actual lookup and linking/creation. This is a new flow that only
// applies to existing logged-in artists, so no email or password is
// needed here -- the account is already known from the session.
// instagramHandle and dateOfBirth are reused from the shared validation module, not redefined.
export const becomeClientInputSchema = z.object({
  instagramHandle: instagramHandleSchema,
  phone: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
});
