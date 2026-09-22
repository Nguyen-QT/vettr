// Pure domain contracts for the intake bounded context. Deliberately
// standalone TypeScript — no z.infer, no import from intake.schema.ts —
// so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime arrays and intake.schema.ts's Zod schemas by hand; they are not
// derived from one another.
//
// SlotTime is the one exception to "standalone" above: it's imported
// from scheduling rather than redefined, since scheduling is the
// lower-level domain that owns it (intake depends on scheduling, not
// the other way around) and both domains need the exact same set.
import type { SlotTime } from "@/domains/scheduling/types";

export type ComplexityTier = "TIER_2" | "TIER_3" | "TIER_4" | "FREESTYLE";

export type DesignTag =
  | "fine-line-detail"
  | "custom-illustration"
  | "full-color-realism"
  | "geometric-pattern"
  | "simple-line"
  | "single-color"
  | "small-basic"
  | "quick-flash"
  | "OTHER";

export type AestheticTag =
  | "abstract-expressive"
  | "watercolor-blend"
  | "large-scale-piece"
  | "bold-traditional"
  | "minimalist-clean"
  | "single-tone"
  | "OTHER";

export interface ClientBudgetRange {
  minPrice: number;
  maxPrice: number;
}

// Client-supplied fields only. Artist-controlled state (estimatedPrice,
// depositPaid, enforcePrecharge, cancellationCount) is set elsewhere and
// never accepted as input here.
export interface ClientIntakeInput {
  instagramHandle: string;
  designReferenceImageUrls: string[];
  tier: ComplexityTier;
  clientBudgetRange: ClientBudgetRange;
  designTags?: DesignTag[];
  aestheticTags?: AestheticTag[];
  email: string;
  phone?: string;
  clientNotes?: string;
  // Combined into IntakeRequest.requestedStartTime on submission
  // (CLAUDE.md 4.1e) -- kept as separate date/time fields here since
  // that's how the form actually collects them.
  requestedDate: string;
  requestedTime: SlotTime;
}

// Requests the artist dashboard shows because they need action:
// PENDING (never reviewed) or AWAITING_SLOT_CONFIRMATION (a proposed
// double-slot booking waiting on the artist's off-platform confirmation,
// CLAUDE.md 4.1f/g). Distinct from RequestStatus, which has other values
// (APPROVED, DECLINED, ...) the dashboard never needs to render.
export type ActionableRequestStatus = "PENDING" | "AWAITING_SLOT_CONFIRMATION";

// Read-shaped projection of an actionable IntakeRequest for the artist
// dashboard (Phase 3, extended 4.1i). Distinct from ClientIntakeInput:
// this describes what the artist reviews, not what the client submitted.
export interface PendingIntakeRequestSummary {
  id: string;
  status: ActionableRequestStatus;
  clientInstagramHandle: string;
  clientEmail: string;
  clientPhone: string | null;
  tier: ComplexityTier;
  minPrice: number;
  maxPrice: number;
  designTags: string[];
  aestheticTags: string[];
  clientNotes: string | null;
  designReferenceImageUrls: string[];
  // The client's chosen candidate slot (CLAUDE.md 4.1e) -- nullable at
  // the DB level only for rows that predate that capture; every row
  // created through the current intake form always has one.
  requestedStartTime: Date | null;
  createdAt: Date;
}

// Read-shaped projection of an APPROVED IntakeRequest with a future
// booking, for the artist's upcoming-appointments view (CLAUDE.md 4.5).
// startTime/endTime span all of the request's booked TimeSlot rows
// (two, adjacent, for a duration that overflowed one slot) rather than
// exposing the individual rows -- the artist just needs the overall
// appointment window here.
export interface UpcomingAppointmentSummary {
  id: string;
  clientInstagramHandle: string;
  clientEmail: string;
  clientPhone: string | null;
  tier: ComplexityTier;
  // Nullable at the DB level only -- every request that reaches
  // APPROVED via reviewIntakeRequest/confirmProposedBooking (CLAUDE.md
  // 4.4) always has one set by the time it gets here.
  estimatedPrice: number | null;
  designTags: string[];
  aestheticTags: string[];
  clientNotes: string | null;
  designReferenceImageUrls: string[];
  startTime: Date;
  endTime: Date;
}

// Mirrors Prisma's RequestStatus enum. Unlike ActionableRequestStatus
// above (the artist-dashboard subset), the client dashboard shows every
// status a booking can be in, including ones the artist view never
// needs to render (DECLINED, CANCELLED_BY_CLIENT, CANCELLED_BY_ARTIST,
// NO_SHOW, COMPLETED).
export type RequestStatus =
  | "PENDING"
  | "AWAITING_SLOT_CONFIRMATION"
  | "APPROVED"
  | "DECLINED"
  | "CANCELLED_BY_CLIENT"
  | "CANCELLED_BY_ARTIST"
  | "NO_SHOW"
  | "COMPLETED";

// Read-shaped projection of an IntakeRequest for the client dashboard
// (CLAUDE.md 5.2) -- every booking a ClientProfile has across every
// artist, not scoped to one artist the way the dashboard/appointments
// views above are. Identifies the artist by name/handle rather than id
// alone, since this is a client-facing read.
export interface ClientBookingSummary {
  id: string;
  status: RequestStatus;
  artistName: string;
  artistInstagramHandle: string;
  tier: ComplexityTier;
  minPrice: number;
  maxPrice: number;
  estimatedPrice: number | null;
  clientNotes: string | null;
  requestedStartTime: Date | null;
  createdAt: Date;
}

// Write command (CLAUDE.md 5.4): self-service cancellation from the
// client dashboard. clientProfileId comes from the trusted session,
// never client-supplied input -- see services/cancelIntakeRequest.ts.
export interface CancelIntakeRequestInput {
  intakeRequestId: string;
  clientProfileId: string;
}

export type CancelIntakeRequestResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.4): self-service edit of a still-PENDING
// request. Deliberately a narrower field set than ClientIntakeInput --
// tier/tags/images stay fixed after submission, only notes, budget, and
// requested date/time are editable in this first pass.
export interface UpdatePendingIntakeRequestInput {
  intakeRequestId: string;
  clientProfileId: string;
  clientNotes?: string;
  clientBudgetRange: ClientBudgetRange;
  requestedDate: string;
  requestedTime: SlotTime;
}

export type UpdatePendingIntakeRequestResult =
  | { success: true }
  | { success: false; error: string };

// Write command (CLAUDE.md 5.5): artist-initiated reschedule of an
// already-APPROVED booking. No clientProfileId -- this is an artist
// action, ownership-checked against the artist's own session at the
// Controller/Action layer instead (see intake/actions.ts).
export interface RescheduleApprovedBookingInput {
  intakeRequestId: string;
  newStartTime: Date;
  durationMinutes: number;
}

export type RescheduleApprovedBookingResult =
  | { success: true }
  | { success: false; error: string };

// One artist's own example images, grouped by tier (CLAUDE.md 4.6),
// for the client-facing intake form. Every tier is always present as
// a key, even with an empty array, so the view never has to guess
// whether a tier was omitted vs. genuinely has no images yet.
export type TierReferenceImages = Record<ComplexityTier, string[]>;
