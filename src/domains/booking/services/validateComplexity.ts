import type {
  AestheticTag,
  ComplexityTier,
  DesignTag,
} from "@/domains/booking/types";

export interface ValidateComplexityInput {
  tier: ComplexityTier;
  clientNotes?: string;
  designTags?: DesignTag[];
  aestheticTags?: AestheticTag[];
}

export type ComplexityCheckResult =
  | { success: true }
  | { success: false; error: string };

// Placeholder vocabulary — tune to the actual business taxonomy. Subsets
// of booking.schema.ts's DESIGN_TAG_OPTIONS/AESTHETIC_TAG_OPTIONS, typed
// against those unions so a mistyped tag value is a compile error.
const BASIC_DESIGN_TAGS: readonly DesignTag[] = [
  "simple-line",
  "single-color",
  "small-basic",
  "quick-flash",
];

const WHITELISTED_DESIGN_TAGS: readonly DesignTag[] = [
  "fine-line-detail",
  "custom-illustration",
  "full-color-realism",
  "geometric-pattern",
];

const BASIC_AESTHETIC_TAGS: readonly AestheticTag[] = [
  "minimalist-clean",
  "single-tone",
];

const WHITELISTED_AESTHETIC_TAGS: readonly AestheticTag[] = [
  "abstract-expressive",
  "watercolor-blend",
  "large-scale-piece",
  "bold-traditional",
];

export const BASIC_WORK_BLACKLIST = [
  "simple",
  "basic",
  "small",
  "quick",
  "plain",
  "single color",
  "one color",
  "nothing fancy",
  "nothing special",
  "just a",
  "whatever you think",
  "surprise me",
];

export const ADVANCED_COMPLEXITY_TERMS = [
  "intricate",
  "detailed",
  "custom",
  "realism",
  "fine line",
  "geometric",
  "watercolor",
  "3d",
  "shading",
  "portrait",
  "full sleeve",
  "blackout",
  "linework",
  "complex",
];

const FRIENDLY_REJECTION_MESSAGE =
  "This looks like a simpler request than what we take on here — if you have something more custom in mind, tell us more about it and resubmit!";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesAnyTerm(text: string, terms: readonly string[]): boolean {
  if (!text) return false;
  return terms.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)
  );
}

// Pure Business Logic Core (CLAUDE.md 2.3): a content gatekeeper, not a
// re-check of booking.schema.ts's structural rules. Assumes the input has
// already passed clientBookingInputSchema.
export function validateComplexity(
  input: ValidateComplexityInput
): ComplexityCheckResult {
  const notes = input.clientNotes ?? "";
  const hasWhitelistedPhrase = matchesAnyTerm(notes, ADVANCED_COMPLEXITY_TERMS);
  const hasBlacklistedPhrase = matchesAnyTerm(notes, BASIC_WORK_BLACKLIST);

  let hasWhitelistedTag: boolean;
  let hasBlacklistedTag: boolean;

  if (input.tier === "FREESTYLE") {
    const tags = input.aestheticTags ?? [];
    hasWhitelistedTag = tags.some((tag) => WHITELISTED_AESTHETIC_TAGS.includes(tag));
    hasBlacklistedTag = tags.some((tag) => BASIC_AESTHETIC_TAGS.includes(tag));
  } else {
    const tags = input.designTags ?? [];
    hasWhitelistedTag = tags.some((tag) => WHITELISTED_DESIGN_TAGS.includes(tag));
    hasBlacklistedTag = tags.some((tag) => BASIC_DESIGN_TAGS.includes(tag));
  }

  if (hasWhitelistedTag || hasWhitelistedPhrase) {
    return { success: true };
  }

  if (hasBlacklistedTag || hasBlacklistedPhrase) {
    return { success: false, error: FRIENDLY_REJECTION_MESSAGE };
  }

  return { success: true };
}
