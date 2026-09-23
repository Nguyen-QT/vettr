// Pure domain contracts for the billing bounded context. Deliberately
// standalone TypeScript -- no z.infer, no import from billing.schema.ts
// -- so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime bounds and billing.schema.ts's Zod schema by hand; they are
// not derived from one another. ComplexityTier is reused from booking
// rather than redeclared here -- tier is an booking concept (CLAUDE.md
// 2.1), billing only prices against it.
import type { ComplexityTier } from "@/domains/booking/types";

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

// clientProfileId is the trusted session's own id (see booking's
// cancelBookingRequest precedent), never client-supplied.
export interface CreateDepositPaymentIntentInput {
  bookingRequestId: string;
  clientProfileId: string;
}

export type CreateDepositPaymentIntentResult =
  | { success: true; clientSecret: string }
  | { success: false; error: string };

export type ConfirmDepositPaymentResult =
  | { success: true }
  | { success: false; error: string };

export type RefundDepositResult =
  | { success: true }
  | { success: false; error: string };

export type ConfirmDepositRefundResult =
  | { success: true }
  | { success: false; error: string };

// Keyed by bookingRequestId (CLAUDE.md 7.1.8) -- only requests that are
// APPROVED, unpaid, and have a configured deposit for their tier
// appear here at all; there is no "not payable yet" entry, unlike
// ArtistDepositSettings' every-tier-present shape above.
export type PayableDeposits = Record<string, number>;

// Day-of checkout flow (CLAUDE.md 7.5). artistId on every input below
// is the trusted session's own id, checked against the owning artist
// via booking's narrow checkout read (7.5.2) inside each service --
// never trusted from client-supplied input.
export interface AddBillingAddonInput {
  bookingRequestId: string;
  artistId: string;
  label: string;
  price: number;
}

export type AddBillingAddonResult =
  | { success: true }
  | { success: false; error: string };

export interface RemoveBillingAddonInput {
  addonId: string;
  artistId: string;
}

export type RemoveBillingAddonResult =
  | { success: true }
  | { success: false; error: string };

export interface BillingAddonSummary {
  id: string;
  label: string;
  price: number;
}

export type GetBillingAddonsResult =
  | { success: true; addons: BillingAddonSummary[] }
  | { success: false; error: string };

// The day-of checkout flow's running total (CLAUDE.md 7.5.4): the base
// estimate plus every addon, crediting a deposit already paid against
// the total. depositCredit is 0 whenever depositPaid is false, not
// just when no deposit was ever configured for this tier.
export interface FinalBillBreakdown {
  estimatedPrice: number;
  addonsTotal: number;
  depositCredit: number;
  total: number;
}

export type GetFinalBillTotalResult =
  | { success: true; bill: FinalBillBreakdown }
  | { success: false; error: string };

export type FinalizeCheckoutResult =
  | { success: true }
  | { success: false; error: string };
