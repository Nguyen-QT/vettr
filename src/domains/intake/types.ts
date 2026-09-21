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
  tier: ComplexityTier;
  minPrice: number;
  maxPrice: number;
  designTags: string[];
  aestheticTags: string[];
  clientNotes: string | null;
  designReferenceImageUrls: string[];
  createdAt: Date;
}
