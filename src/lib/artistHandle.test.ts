import { describe, expect, it } from "vitest";

import {
  artistHandleSchema,
  isReservedArtistHandle,
  normalizeArtistHandle,
  RESERVED_ARTIST_HANDLES,
} from "./artistHandle";

describe("normalizeArtistHandle", () => {
  it("strips a leading @", () => {
    expect(normalizeArtistHandle("@studio")).toBe("studio");
  });

  it("lowercases", () => {
    expect(normalizeArtistHandle("StUdIo")).toBe("studio");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeArtistHandle("  @studio  ")).toBe("studio");
  });

  it("strips only one leading @", () => {
    expect(normalizeArtistHandle("@@x")).toBe("@x");
  });

  it("leaves an internal @ alone", () => {
    expect(normalizeArtistHandle("a@b")).toBe("a@b");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeArtistHandle("")).toBe("");
  });
});

describe("artistHandleSchema", () => {
  function parse(value: string): string | null {
    const result = artistHandleSchema.safeParse(value);
    return result.success ? result.data : null;
  }

  it.each([
    ["a", "a"],
    ["a".repeat(30), "a".repeat(30)],
    ["nail.artist_99", "nail.artist_99"],
    ["@Mixed.Case_1", "mixed.case_1"],
    [`@${"b".repeat(30)}`, "b".repeat(30)],
  ])("accepts %s", (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it.each([
    [""],
    ["@"],
    ["   "],
    ["a".repeat(31)],
    [".studio"],
    ["studio."],
    ["_studio"],
    ["studio_"],
    ["nail-artist"],
    ["nail artist"],
    ["studio!"],
    ["@@x"],
    ["café"],
  ])("rejects %j", (input) => {
    expect(parse(input)).toBeNull();
  });

  it.each([...RESERVED_ARTIST_HANDLES])("rejects reserved word %s", (word) => {
    expect(parse(word)).toBeNull();
  });

  it("rejects reserved words after normalisation", () => {
    expect(parse("@Admin")).toBeNull();
    expect(parse(" WWW ")).toBeNull();
  });

  it("rejects the .rsc suffix", () => {
    expect(parse("studio.rsc")).toBeNull();
    expect(parse("@X.RSC")).toBeNull();
  });

  it.each(["rsc", "admin1", "studio.rs"])("accepts near-miss %s", (input) => {
    expect(parse(input)).toBe(input);
  });
});

describe("isReservedArtistHandle", () => {
  it("is true for a reserved word", () => {
    expect(isReservedArtistHandle("login")).toBe(true);
  });

  it("is true for the .rsc suffix", () => {
    expect(isReservedArtistHandle("studio.rsc")).toBe(true);
  });

  it("is false for an ordinary handle", () => {
    expect(isReservedArtistHandle("studio")).toBe(false);
  });
});
