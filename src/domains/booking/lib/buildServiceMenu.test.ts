import { describe, expect, it } from "vitest";

import {
  COMPLEXITY_TIERS,
  COMPLEXITY_TIER_LABELS,
  TIER_BASELINE_BUDGETS,
} from "../constants";
import type { TierDepositAmounts } from "../types";
import { buildServiceMenu } from "./buildServiceMenu";

const noDeposits: TierDepositAmounts = {
  TIER_2: null,
  TIER_3: null,
  TIER_4: null,
  FREESTYLE: null,
};

describe("buildServiceMenu", () => {
  it("returns all 4 tiers exactly once, in COMPLEXITY_TIERS order", () => {
    // Keys deliberately out of order -- output order must not follow input.
    const shuffled: TierDepositAmounts = {
      FREESTYLE: 10,
      TIER_4: null,
      TIER_2: 20,
      TIER_3: null,
    };

    const menu = buildServiceMenu(shuffled);

    expect(menu.map((item) => item.tier)).toEqual([...COMPLEXITY_TIERS]);
  });

  it("uses the tier label and baseline budget constants", () => {
    const menu = buildServiceMenu(noDeposits);

    for (const item of menu) {
      expect(item.label).toBe(COMPLEXITY_TIER_LABELS[item.tier]);
      expect(item.baselineBudget).toEqual(TIER_BASELINE_BUDGETS[item.tier]);
    }
  });

  it("keeps null deposits as null (not 0) when nothing is configured", () => {
    const menu = buildServiceMenu(noDeposits);

    expect(menu.every((item) => item.depositAmount === null)).toBe(true);
  });

  it("passes configured deposits through, including decimals, alongside nulls", () => {
    const menu = buildServiceMenu({
      TIER_2: 45.5,
      TIER_3: null,
      TIER_4: 80,
      FREESTYLE: null,
    });

    expect(menu.map((item) => item.depositAmount)).toEqual([45.5, null, 80, null]);
  });

  it("returns a copy of the baseline budget, not the shared constant", () => {
    const menu = buildServiceMenu(noDeposits);
    const original = { ...TIER_BASELINE_BUDGETS.TIER_2 };

    menu[0].baselineBudget.minPrice = 9999;

    expect(TIER_BASELINE_BUDGETS.TIER_2).toEqual(original);
  });

  it("exposes only the narrow DTO keys", () => {
    const [item] = buildServiceMenu(noDeposits);

    expect(Object.keys(item).sort()).toEqual([
      "baselineBudget",
      "depositAmount",
      "label",
      "tier",
    ]);
  });
});
