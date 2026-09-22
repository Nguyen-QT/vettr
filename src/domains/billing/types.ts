// Pure domain contracts for the billing bounded context. Deliberately
// standalone TypeScript -- no z.infer, no import from billing.schema.ts
// -- so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime bounds and billing.schema.ts's Zod schema by hand; they are
// not derived from one another. ComplexityTier is reused from intake
// rather than redeclared here -- tier is an intake concept (CLAUDE.md
// 2.1), billing only prices against it.
import type { ComplexityTier } from "@/domains/intake/types";

// Write command (CLAUDE.md 7.1): upserts the deposit amount an artist
// requires for one tier. Never calling this for a given tier is what
// leaves it at ArtistDepositSettings' default-null below.
export interface SetArtistDepositSettingInput {
  artistId: string;
  tier: ComplexityTier;
  depositAmount: number;
}

// Keyed by every ComplexityTier so callers never need an existence
// check -- a null value means the artist hasn't configured a deposit
// for that tier yet, same "no config = default open" precedent as
// scheduling's ArtistWeeklyHours (4.3), applied here as "no deposit
// required yet".
export type ArtistDepositSettings = Record<ComplexityTier, number | null>;

// clientProfileId is the trusted session's own id (see intake's
// cancelIntakeRequest precedent), never client-supplied.
export interface CreateDepositPaymentIntentInput {
  intakeRequestId: string;
  clientProfileId: string;
}

export type CreateDepositPaymentIntentResult =
  | { success: true; clientSecret: string }
  | { success: false; error: string };

export type ConfirmDepositPaymentResult =
  | { success: true }
  | { success: false; error: string };
