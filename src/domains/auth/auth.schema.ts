import { z } from "zod";

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
