import { z } from "zod";

// Structural validity only -- see services/loginArtist.ts for the
// actual credential check against the database. Password has no
// minimum length here: a login attempt validates against whatever was
// actually set at provisioning time, not today's policy floor.
export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required."),
});
