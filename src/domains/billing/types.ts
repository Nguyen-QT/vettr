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

// What confirmDepositPayment does with a payment once it's recorded, by
// the status the booking was in when it landed (56.2): RECORD keeps the
// deposit, REFUND returns it in full, ALERT keeps it and raises a
// critical log for manual reconciliation.
export type DepositPaymentAction = "RECORD" | "REFUND" | "ALERT";

// Stripe's PaymentIntent statuses (56.4). Declared here rather than taken
// from Stripe.PaymentIntent.Status, which also admits any string and so
// can't key an exhaustive Record.
export type DepositPaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "requires_capture"
  | "succeeded"
  | "canceled";

// What createDepositPaymentIntent does with the booking's stored
// PaymentIntent, by its status (56.4): REUSE keeps it if its amount and
// routing still match what would be created now (otherwise cancels it,
// then replaces it), REFUSE leaves a payment in flight to the webhook,
// REPLACE creates a new one in place of a cancelled one.
export type StoredDepositPaymentIntentAction = "REUSE" | "REFUSE" | "REPLACE";

export type RefundDepositResult =
  | { success: true }
  | { success: false; error: string };

// Mirrors Prisma's DepositRefundStatus enum (56.6): where a deposit
// refund stands, in its fixed precedence PENDING < SUCCEEDED < FAILED.
export type DepositRefundStatus = "PENDING" | "SUCCEEDED" | "FAILED";

// Stripe's refund statuses (56.6). Declared here for the same reason as
// DepositPaymentIntentStatus: Stripe.Refund's status is `string | null`,
// which can't key an exhaustive Record.
export type DepositRefundStripeStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "canceled";

// stripeStatus and failureReason are the refund's own status and
// failure_reason as Stripe reports them, unmapped, so every caller
// passes them straight through and advanceDepositRefundStatus alone
// decides what a null or unknown status means.
export interface AdvanceDepositRefundStatusInput {
  bookingRequestId: string;
  stripeRefundId: string;
  stripeStatus: string | null;
  failureReason?: string;
}

// A refund webhook event's own fields (56.6), unmapped for the same reason
// as AdvanceDepositRefundStatusInput. metadataBookingRequestId is the
// metadata.bookingRequestId refundDeposit sets on every refund it creates;
// a refund made anywhere else (the Stripe Dashboard) doesn't carry it.
export interface SyncDepositRefundStatusInput {
  stripeRefundId: string;
  stripePaymentIntentId: string | null;
  metadataBookingRequestId?: string;
  stripeStatus: string | null;
  failureReason?: string;
}

// A booking's recorded refund intent (56.6), new or already there: the
// PaymentIntent it refunds, and the Stripe refund id once one is stored.
export interface DepositRefundIntent {
  stripePaymentIntentId: string;
  stripeRefundId: string | null;
}

// Keyed by bookingRequestId (CLAUDE.md 7.1.8) -- only requests that are
// APPROVED, unpaid, and have a configured deposit for their tier
// appear here at all; there is no "not payable yet" entry, unlike
// ArtistDepositSettings' every-tier-present shape above.
export type PayableDeposits = Record<string, number>;

// Keyed by bookingRequestId (56.6), like PayableDeposits. A booking with
// no DepositRefund row is absent, never a "no refund" entry: the card
// keeps its existing labels for it. An id-less PENDING row (a refund
// whose Stripe call failed, which 56.7 will retry) is reported as PENDING.
export type DepositRefundStatuses = Record<string, DepositRefundStatus>;

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

// Stripe Connect Express onboarding (CLAUDE.md 24.1) -- connected is
// true once stripeConnectAccountId is set, regardless of whether
// Stripe has finished enabling charges/payouts for it yet; the two
// capability flags are what actually gate deposit routing in
// createDepositPaymentIntent.
export interface ArtistConnectStatus {
  connected: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export type CreateConnectOnboardingLinkResult =
  | { success: true; url: string }
  | { success: false; error: string };
