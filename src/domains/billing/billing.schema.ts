import { z } from "zod";

import { COMPLEXITY_TIERS } from "@/domains/intake/constants";

import { MIN_DEPOSIT_AMOUNT } from "./constants";

// Structural validity only -- see services/setArtistDepositSettings.ts
// for the upsert itself. artistId is deliberately excluded -- actions.ts
// derives it from the trusted session rather than trusting a
// client-supplied value, same posture as intake's newer session-derived
// actions (5.4.2/5.5.2/5.6.3).
export const setArtistDepositSettingInputSchema = z.object({
  tier: z.enum(COMPLEXITY_TIERS),
  depositAmount: z
    .number()
    .min(
      MIN_DEPOSIT_AMOUNT,
      `The deposit amount must be at least ${MIN_DEPOSIT_AMOUNT}.`
    ),
});
