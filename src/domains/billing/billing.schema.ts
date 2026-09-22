import { z } from "zod";

import { COMPLEXITY_TIERS } from "@/domains/intake/constants";

import { MIN_DEPOSIT_AMOUNT } from "./constants";

// Structural validity only -- see services/setArtistDepositSettings.ts
// for the upsert itself.
export const setArtistDepositSettingInputSchema = z.object({
  artistId: z.string().min(1),
  tier: z.enum(COMPLEXITY_TIERS),
  depositAmount: z
    .number()
    .min(
      MIN_DEPOSIT_AMOUNT,
      `The deposit amount must be at least ${MIN_DEPOSIT_AMOUNT}.`
    ),
});

// Shared by the deposit-settings read action (CLAUDE.md 7.1).
export const artistIdInputSchema = z.object({
  artistId: z.string().min(1),
});
