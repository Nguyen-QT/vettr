// Pure domain contracts for the intake bounded context. Deliberately
// standalone TypeScript — no z.infer, no import from intake.schema.ts —
// so the domain's shape doesn't depend on which validation library
// enforces it at runtime. Kept structurally in sync with constants.ts's
// runtime arrays and intake.schema.ts's Zod schemas by hand; they are not
// derived from one another.

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
  email?: string;
  phone?: string;
  clientNotes?: string;
}

// Read-shaped projection of a PENDING IntakeRequest for the artist
// dashboard (Phase 3). Distinct from ClientIntakeInput: this describes
// what the artist reviews, not what the client submitted.
export interface PendingIntakeRequestSummary {
  id: string;
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
