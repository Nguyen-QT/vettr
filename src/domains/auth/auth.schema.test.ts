import { describe, expect, it } from "vitest";

import {
  requestClientSignInCodeInputSchema,
  verifyClientSignInCodeInputSchema,
} from "./auth.schema";

// Length/format edge cases live in src/lib/email.test.ts -- these only
// prove the schemas are wired to the normalising email schema.
describe("requestClientSignInCodeInputSchema", () => {
  it("accepts a valid email", () => {
    expect(
      requestClientSignInCodeInputSchema.safeParse({ email: "client@example.com" }).success
    ).toBe(true);
  });

  it("normalises the email", () => {
    const result = requestClientSignInCodeInputSchema.safeParse({
      email: "  Client@Example.COM ",
    });
    expect(result.success && result.data).toEqual({ email: "client@example.com" });
  });

  it("rejects an invalid email with the generic message", () => {
    const result = requestClientSignInCodeInputSchema.safeParse({ email: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
  });
});

describe("verifyClientSignInCodeInputSchema", () => {
  const validSignInInput = { email: "client@example.com", code: "123456" };

  it("accepts an email and code with no password", () => {
    expect(verifyClientSignInCodeInputSchema.safeParse(validSignInInput).success).toBe(true);
  });

  it("normalises the email", () => {
    const result = verifyClientSignInCodeInputSchema.safeParse({
      ...validSignInInput,
      email: "  Client@Example.COM ",
    });
    expect(result.success && result.data).toEqual({
      email: "client@example.com",
      code: "123456",
    });
  });

  it("keeps a leading-zero code as a string", () => {
    const result = verifyClientSignInCodeInputSchema.safeParse({
      ...validSignInInput,
      code: "001234",
    });
    expect(result.success && result.data.code).toBe("001234");
  });

  it.each(["12345", "1234567", "12a456", "", "123 56"])("rejects code %j", (code) => {
    expect(
      verifyClientSignInCodeInputSchema.safeParse({ ...validSignInInput, code }).success
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      verifyClientSignInCodeInputSchema.safeParse({ ...validSignInInput, email: "not-an-email" })
        .success
    ).toBe(false);
  });
});
