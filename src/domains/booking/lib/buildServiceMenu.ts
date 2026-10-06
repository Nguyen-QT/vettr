// Pure service-menu assembly for the public artist profile (54.1.2.4):
// one item per ComplexityTier, in COMPLEXITY_TIERS order, combining the
// display label, the artist's deposit (null = not configured) and the
// baseline budget. No I/O, no React -- the page just composes the reads.

import {
  COMPLEXITY_TIERS,
  COMPLEXITY_TIER_LABELS,
  TIER_BASELINE_BUDGETS,
} from "../constants";
import type { ServiceMenuItem, TierDepositAmounts } from "../types";

export function buildServiceMenu(
  depositsByTier: TierDepositAmounts
): ServiceMenuItem[] {
  return COMPLEXITY_TIERS.map((tier) => ({
    tier,
    label: COMPLEXITY_TIER_LABELS[tier],
    depositAmount: depositsByTier[tier],
    // Copied so callers can't mutate the shared constant.
    baselineBudget: { ...TIER_BASELINE_BUDGETS[tier] },
  }));
}
