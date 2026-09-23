import { z } from "zod";

import { COMPLEXITY_TIERS } from "@/domains/booking/constants";

import { MIN_ADDON_PRICE, MIN_DEPOSIT_AMOUNT } from "./constants";

// Structural validity only -- see services/setArtistDepositSettings.ts
// for the upsert itself. artistId is deliberately excluded -- actions.ts
// derives it from the trusted session rather than trusting a
// client-supplied value, same posture as booking's newer session-derived
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

// Structural validity only -- see services/addBillingAddon.ts for the
// actual write. bookingRequestId/artistId are deliberately excluded --
// actions.ts derives artistId from the trusted session and takes
// bookingRequestId as a separate route/action param, same posture as
// setArtistDepositSettingInputSchema above.
export const addBillingAddonInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  price: z
    .number()
    .min(MIN_ADDON_PRICE, `The addon price must be at least ${MIN_ADDON_PRICE}.`),
});
