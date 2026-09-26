import type { ClientBudgetRange, ComplexityTier } from "./types";

export const MIN_DESIGN_REFERENCE_IMAGES = 1;
export const MAX_DESIGN_REFERENCE_IMAGES = 5;

export const COMPLEXITY_TIERS = ["TIER_2", "TIER_3", "TIER_4", "FREESTYLE"] as const;

// A client's stated preference for settling the final on-the-day balance
// (CLAUDE.md 23.1) -- deposits stay card-only/Stripe regardless, so this
// only ever describes the final-bill payment, not the deposit.
export const PAYMENT_METHODS = ["CASH", "CARD"] as const;

export const OTHER_TAG_VALUE = "OTHER";

// Curated design tags for TIER_2/3/4 requests. Placeholder vocabulary —
// tune to the actual business taxonomy. Kept structurally in sync with
// types.ts's DesignTag union by hand, not derived from it.
export const DESIGN_TAG_OPTIONS = [
  "fine-line-detail",
  "custom-illustration",
  "full-color-realism",
  "geometric-pattern",
  "simple-line",
  "single-color",
  "small-basic",
  "quick-flash",
  OTHER_TAG_VALUE,
] as const;

// Curated aesthetic/theme tags for FREESTYLE requests. Placeholder
// vocabulary — tune to the actual business taxonomy. Kept structurally
// in sync with types.ts's AestheticTag union by hand.
export const AESTHETIC_TAG_OPTIONS = [
  "abstract-expressive",
  "watercolor-blend",
  "large-scale-piece",
  "bold-traditional",
  "minimalist-clean",
  "single-tone",
  OTHER_TAG_VALUE,
] as const;

// Default scroll-wheel bounds per tier; the client can adjust away from
// these (hard enforcement lives in booking.schema.ts's clientBudgetRangeSchema).
// Placeholder values — tune to the actual pricing model.
export const TIER_BASELINE_BUDGETS: Record<ComplexityTier, ClientBudgetRange> = {
  TIER_2: { minPrice: 50, maxPrice: 100 },
  TIER_3: { minPrice: 100, maxPrice: 200 },
  TIER_4: { minPrice: 200, maxPrice: 400 },
  FREESTYLE: { minPrice: 50, maxPrice: 500 },
};

// Self-service cancellation (CLAUDE.md 5.4): an APPROVED request (slot
// already booked) can only be self-cancelled outside this window.
// PENDING/AWAITING_SLOT_CONFIRMATION requests have no locked slot yet,
// so this doesn't apply to them. Full offense-counting/enforcePrecharge
// is deferred to 5.6 -- this only blocks the cancel action itself.
export const CANCELLATION_WINDOW_HOURS = 48;

export const REQUEST_NOT_FOUND_ERROR_MESSAGE = "This request could not be found.";

export const REQUEST_ALREADY_RESOLVED_ERROR_MESSAGE =
  "This request has already been cancelled, declined, or completed.";

export const CANCELLATION_WINDOW_ERROR_MESSAGE = `This appointment is within ${CANCELLATION_WINDOW_HOURS} hours -- please contact the artist directly to cancel.`;

export const REQUEST_NOT_EDITABLE_ERROR_MESSAGE =
  "Only pending requests can be edited.";

// Cancellation & No-Show Lifecycle (CLAUDE.md 5.6): a ClientProfile is
// flagged for enforcePrecharge once cancellationCount reaches this many
// strikes. Only an APPROVED-booking client cancellation or a no-show
// counts as a strike -- a PENDING/AWAITING cancellation has no locked
// slot yet (free), and an artist-initiated cancellation is never the
// client's fault (see cancelApprovedBookingAsArtist).
export const STRIKE_THRESHOLD = 1;

export const APPOINTMENT_NOT_YET_DUE_ERROR_MESSAGE =
  "This appointment hasn't happened yet.";

// Client Max End Time (CLAUDE.md 6.3): the minimum gap, in minutes,
// required between the requested start time and the client's "must be
// finished by" time -- no session is ever realistic below this,
// regardless of tier. Enforced in booking.schema.ts; blocks submission.
export const MIN_MAX_END_TIME_GAP_MINUTES = 90;

// Rough expected duration per tier, used only to decide whether to
// show a soft warning (not a blocking error) that a tight deadline may
// force design simplification -- the artist still makes the real
// duration call at review time (CLAUDE.md "No Auto-Booking").
// Placeholder values — tune to the actual service model.
export const TIER_ESTIMATED_DURATION_MINUTES: Record<ComplexityTier, number> = {
  TIER_2: 90,
  TIER_3: 120,
  TIER_4: 180,
  FREESTYLE: 240,
};

export const CLIENT_MAX_END_TIME_COMPLEXITY_WARNING =
  "Due to the complexity of this proposal, the design may need to be simplified to meet your hard deadline.";

// Surfaced by updateClientProfile (CLAUDE.md 10.1) when the requested
// Instagram handle is already taken by another ClientProfile --
// translates the DB's unique-constraint violation into a message a
// client can act on, rather than a raw Prisma exception.
export const INSTAGRAM_HANDLE_TAKEN_ERROR_MESSAGE =
  "That Instagram handle is already in use by another account.";
