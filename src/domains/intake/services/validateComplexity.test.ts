import { describe, expect, it } from "vitest";

import { validateComplexity } from "./validateComplexity";

describe("validateComplexity", () => {
  it("accepts a request with no notes and no tags", () => {
    const result = validateComplexity({ tier: "TIER_2" });
    expect(result.success).toBe(true);
  });

  it("accepts a whitelisted design tag on a non-FREESTYLE tier", () => {
    const result = validateComplexity({
      tier: "TIER_3",
      designTags: ["full-color-realism"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blacklisted design tag on a non-FREESTYLE tier", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      designTags: ["small-basic"],
    });
    expect(result.success).toBe(false);
  });

  it("lets a whitelisted design tag override a blacklisted one", () => {
    const result = validateComplexity({
      tier: "TIER_4",
      designTags: ["small-basic", "custom-illustration"],
    });
    expect(result.success).toBe(true);
  });

  it("uses the aesthetic tag sets for FREESTYLE instead of design tags", () => {
    // "full-color-realism" is a design tag, not an aesthetic tag, so it
    // has no effect here and the blacklisted aesthetic tag should reject.
    const result = validateComplexity({
      tier: "FREESTYLE",
      aestheticTags: ["minimalist-clean"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a whitelisted aesthetic tag on FREESTYLE", () => {
    const result = validateComplexity({
      tier: "FREESTYLE",
      aestheticTags: ["watercolor-blend"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects notes containing a blacklisted phrase", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "Just want something simple on my wrist.",
    });
    expect(result.success).toBe(false);
  });

  it("lets a whitelisted phrase in notes override a blacklisted one", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "Something simple but with intricate fine line detail.",
    });
    expect(result.success).toBe(true);
  });

  it("lets a whitelisted tag override a blacklisted phrase in notes", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "Keep it small and basic.",
      designTags: ["geometric-pattern"],
    });
    expect(result.success).toBe(true);
  });

  it("lets a whitelisted phrase in notes override a blacklisted tag", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "Looking for a detailed realism piece.",
      designTags: ["small-basic"],
    });
    expect(result.success).toBe(true);
  });

  it("does not false-positive 'small' inside 'smaller'", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "I'd like it a bit smaller than the reference image.",
    });
    expect(result.success).toBe(true);
  });

  it("matches blacklisted phrases case-insensitively", () => {
    const result = validateComplexity({
      tier: "TIER_2",
      clientNotes: "SIMPLE design please.",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid TIER_4 request with no matching tags or phrases", () => {
    const result = validateComplexity({
      tier: "TIER_4",
      clientNotes: "Open to your interpretation of the reference images.",
      designTags: ["fine-line-detail"],
    });
    expect(result.success).toBe(true);
  });
});
