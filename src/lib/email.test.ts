import { describe, expect, it } from "vitest";

import { EMAIL_MAX_LENGTH, normalizedEmailSchema, normalizeEmail } from "./email";

// Builds a syntactically valid address of exactly `length` characters.
function emailOfLength(length: number): string {
  const domain = "@example.com";
  return `${"a".repeat(length - domain.length)}${domain}`;
}

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("Jane.Doe@Example.COM")).toBe("jane.doe@example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail(" \t jane@example.com \n")).toBe("jane@example.com");
  });

  it("keeps dots and +tags", () => {
    expect(normalizeEmail("J.A.N.E+Bookings@gmail.com")).toBe(
      "j.a.n.e+bookings@gmail.com"
    );
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeEmail("")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("  Jane@Example.com ");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("normalizedEmailSchema", () => {
  function parse(value: string): string | null {
    const result = normalizedEmailSchema.safeParse(value);
    return result.success ? result.data : null;
  }

  it.each([
    [" A.B+tag@Example.COM ", "a.b+tag@example.com"],
    ["jane@example.com", "jane@example.com"],
    ["JANE@SUB.EXAMPLE.CO.UK", "jane@sub.example.co.uk"],
  ])("accepts %j", (input, expected) => {
    expect(parse(input)).toBe(expected);
  });

  it(`accepts an address of exactly ${EMAIL_MAX_LENGTH} characters`, () => {
    const email = emailOfLength(EMAIL_MAX_LENGTH);
    expect(parse(email)).toBe(email);
  });

  it("applies the length cap after trimming", () => {
    const email = emailOfLength(EMAIL_MAX_LENGTH);
    expect(parse(`  ${email}  `)).toBe(email);
  });

  it(`rejects an address of ${EMAIL_MAX_LENGTH + 1} characters`, () => {
    expect(parse(emailOfLength(EMAIL_MAX_LENGTH + 1))).toBeNull();
  });

  it.each([
    [""],
    ["   "],
    ["no-at-sign"],
    ["a@b"],
    ["café@example.com"],
    ["a @example.com"],
  ])("rejects %j", (input) => {
    expect(parse(input)).toBeNull();
  });

  it("uses one generic message for format and length failures", () => {
    const format = normalizedEmailSchema.safeParse("no-at-sign");
    const length = normalizedEmailSchema.safeParse(
      emailOfLength(EMAIL_MAX_LENGTH + 1)
    );
    const messages = [format, length].map((result) =>
      result.success ? null : result.error.issues.map((issue) => issue.message)
    );
    expect(messages).toEqual([
      ["Enter a valid email address."],
      ["Enter a valid email address."],
    ]);
  });

  it.each([
    [" A.B+tag@Example.COM "],
    ["JANE@SUB.EXAMPLE.CO.UK"],
    [emailOfLength(EMAIL_MAX_LENGTH).toUpperCase()],
  ])("outputs lowercase ASCII for %j (DB lowercase CHECK)", (input) => {
    const output = parse(input);
    expect(output).not.toBeNull();
    expect(output).toBe(output?.toLowerCase());
    expect(output).toMatch(/^[\x00-\x7F]*$/);
  });
});
