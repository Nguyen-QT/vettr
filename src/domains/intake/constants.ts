import type { ClientBudgetRange, ComplexityTier } from "./types";

// Real Instagram handle rules: 1-30 chars, letters/digits/periods/
// underscores, and must start and end on an alphanumeric character.
export const INSTAGRAM_HANDLE_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._]{0,28}[a-zA-Z0-9])?$/;

export const MIN_DESIGN_REFERENCE_IMAGES = 1;
export const MAX_DESIGN_REFERENCE_IMAGES = 5;

export const COMPLEXITY_TIERS = ["TIER_2", "TIER_3", "TIER_4", "FREESTYLE"] as const;

export const OTHER_TAG_VALUE = "OTHER";

// Placeholder set -- tune to the artist's actual daily schedule. Kept
// structurally in sync with types.ts's SlotTime union by hand.
export const DAILY_SLOT_TIME_OPTIONS = ["11:00", "14:00", "17:30"] as const;

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
// these (hard enforcement lives in intake.schema.ts's clientBudgetRangeSchema).
// Placeholder values — tune to the actual pricing model.
export const TIER_BASELINE_BUDGETS: Record<ComplexityTier, ClientBudgetRange> = {
  TIER_2: { minPrice: 50, maxPrice: 100 },
  TIER_3: { minPrice: 100, maxPrice: 200 },
  TIER_4: { minPrice: 200, maxPrice: 400 },
  FREESTYLE: { minPrice: 50, maxPrice: 500 },
};
