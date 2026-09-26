import { describe, expect, it } from "vitest";

import { instagramHandleSchema } from "./clientProfileValidation";

describe("instagramHandleSchema", () => {
  it("accepts a plain handle", () => {
    const result = instagramHandleSchema.safeParse("nail.artist_99");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nail.artist_99");
  });

  it("strips a leading @", () => {
    const result = instagramHandleSchema.safeParse("@nailartist");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nailartist");
  });

  it("trims surrounding whitespace", () => {
    const result = instagramHandleSchema.safeParse("  nailartist  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("nailartist");
  });

  it("rejects an empty handle", () => {
    expect(instagramHandleSchema.safeParse("").success).toBe(false);
  });

  it("rejects a handle that is only an @ sign", () => {
    expect(instagramHandleSchema.safeParse("@").success).toBe(false);
  });

  it("accepts a handle exactly 30 characters long", () => {
    expect(instagramHandleSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("rejects handles longer than 30 characters", () => {
    expect(instagramHandleSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects handles with spaces", () => {
    expect(instagramHandleSchema.safeParse("nail artist").success).toBe(false);
  });

  it("rejects handles with disallowed symbols", () => {
    expect(instagramHandleSchema.safeParse("nail-artist!").success).toBe(false);
  });

  it("rejects a handle starting with a period", () => {
    expect(instagramHandleSchema.safeParse(".nailartist").success).toBe(false);
  });

  it("rejects a handle ending with an underscore preceded by nothing else valid", () => {
    expect(instagramHandleSchema.safeParse("_").success).toBe(false);
  });
});
