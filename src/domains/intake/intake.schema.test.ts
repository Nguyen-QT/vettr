import { describe, expect, it } from "vitest";

import {
  clientIntakeInputSchema,
  designReferenceImagesSchema,
  instagramHandleSchema,
} from "./intake.schema";

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

describe("designReferenceImagesSchema", () => {
  it("rejects an empty array", () => {
    expect(designReferenceImagesSchema.safeParse([]).success).toBe(false);
  });

  it("accepts a single valid image URL", () => {
    const result = designReferenceImagesSchema.safeParse([
      "https://files.example.com/ref-1.png",
    ]);
    expect(result.success).toBe(true);
  });

  it("accepts up to 5 valid image URLs", () => {
    const urls = Array.from(
      { length: 5 },
      (_, i) => `https://files.example.com/ref-${i}.png`
    );
    expect(designReferenceImagesSchema.safeParse(urls).success).toBe(true);
  });

  it("rejects more than 5 image URLs", () => {
    const urls = Array.from(
      { length: 6 },
      (_, i) => `https://files.example.com/ref-${i}.png`
    );
    expect(designReferenceImagesSchema.safeParse(urls).success).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(designReferenceImagesSchema.safeParse(["not-a-url"]).success).toBe(
      false
    );
  });

  it("rejects the array when any entry is invalid", () => {
    const result = designReferenceImagesSchema.safeParse([
      "https://files.example.com/ref-1.png",
      "not-a-url",
    ]);
    expect(result.success).toBe(false);
  });
});

describe("clientIntakeInputSchema", () => {
  const validPayload = {
    instagramHandle: "nailartist",
    designReferenceImageUrls: ["https://files.example.com/ref-1.png"],
  };

  it("accepts the minimum required fields", () => {
    expect(clientIntakeInputSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts optional email, phone, and notes", () => {
    const result = clientIntakeInputSchema.safeParse({
      ...validPayload,
      email: "client@example.com",
      phone: "+1 555 0100",
      notes: "Prefers weekday afternoons.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = clientIntakeInputSchema.safeParse({
      ...validPayload,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank phone string", () => {
    const result = clientIntakeInputSchema.safeParse({
      ...validPayload,
      phone: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when designReferenceImageUrls is missing", () => {
    const result = clientIntakeInputSchema.safeParse({
      instagramHandle: "nailartist",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when instagramHandle is missing", () => {
    const result = clientIntakeInputSchema.safeParse({
      designReferenceImageUrls: ["https://files.example.com/ref-1.png"],
    });
    expect(result.success).toBe(false);
  });
});
