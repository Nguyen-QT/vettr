import { describe, expect, it } from "vitest";

import {
  artistPasswordResetFormSchema,
  requestArtistPasswordResetInputSchema,
  requestClientSignInCodeInputSchema,
  resetArtistPasswordInputSchema,
  verifyClientSignInCodeInputSchema,
} from "./auth.schema";
import {
  INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE,
  MAX_ARTIST_PASSWORD_LENGTH,
  MIN_ARTIST_PASSWORD_LENGTH,
} from "./constants";

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

describe("requestArtistPasswordResetInputSchema", () => {
  it("normalises the email", () => {
    const result = requestArtistPasswordResetInputSchema.safeParse({
      email: "  Artist@Example.COM ",
    });
    expect(result.success && result.data).toEqual({ email: "artist@example.com" });
  });

  it("rejects an invalid email with the generic message", () => {
    const result = requestArtistPasswordResetInputSchema.safeParse({ email: "nope" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a valid email address.");
  });
});

const VALID_TOKEN = "A".repeat(43);
const validPassword = "a".repeat(MIN_ARTIST_PASSWORD_LENGTH);

describe("resetArtistPasswordInputSchema", () => {
  const validReset = { token: VALID_TOKEN, newPassword: validPassword };

  it("accepts a 43-char base64url token and a minimum-length password", () => {
    expect(resetArtistPasswordInputSchema.safeParse(validReset).success).toBe(true);
  });

  it("accepts the base64url alphabet, including - and _", () => {
    const token = `${"-_aZ09".repeat(7)}-`;
    expect(token).toHaveLength(43);
    expect(resetArtistPasswordInputSchema.safeParse({ ...validReset, token }).success).toBe(true);
  });

  it.each([
    ["too short", "A".repeat(42)],
    ["too long", "A".repeat(44)],
    ["a + character", `${"A".repeat(42)}+`],
    ["a / character", `${"A".repeat(42)}/`],
    ["base64 padding", `${"A".repeat(42)}=`],
    ["a space", `${"A".repeat(42)} `],
    ["a trailing newline", `${"A".repeat(43)}\n`],
    ["empty", ""],
  ])("rejects a token that is %s with the generic invalid-link message", (_label, token) => {
    const result = resetArtistPasswordInputSchema.safeParse({ ...validReset, token });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(INVALID_PASSWORD_RESET_LINK_ERROR_MESSAGE);
  });

  it("rejects a password one under the minimum", () => {
    const result = resetArtistPasswordInputSchema.safeParse({
      ...validReset,
      newPassword: "a".repeat(MIN_ARTIST_PASSWORD_LENGTH - 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `Password must be at least ${MIN_ARTIST_PASSWORD_LENGTH} characters.`
    );
  });

  it("accepts a password at the maximum and rejects one over it", () => {
    expect(
      resetArtistPasswordInputSchema.safeParse({
        ...validReset,
        newPassword: "a".repeat(MAX_ARTIST_PASSWORD_LENGTH),
      }).success
    ).toBe(true);

    const result = resetArtistPasswordInputSchema.safeParse({
      ...validReset,
      newPassword: "a".repeat(MAX_ARTIST_PASSWORD_LENGTH + 1),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `Password must be at most ${MAX_ARTIST_PASSWORD_LENGTH} characters.`
    );
  });

  it("applies no character-mix rules and keeps the password verbatim", () => {
    const newPassword = "            "; // 12 spaces: no trim, no mix rule
    const result = resetArtistPasswordInputSchema.safeParse({ ...validReset, newPassword });
    expect(result.success && result.data.newPassword).toBe(newPassword);
  });
});

describe("artistPasswordResetFormSchema", () => {
  it("accepts matching passwords", () => {
    expect(
      artistPasswordResetFormSchema.safeParse({
        newPassword: validPassword,
        confirmPassword: validPassword,
      }).success
    ).toBe(true);
  });

  it("rejects a mismatched confirmation on the confirmPassword field", () => {
    const result = artistPasswordResetFormSchema.safeParse({
      newPassword: validPassword,
      confirmPassword: `${validPassword}x`,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    });
  });

  it("applies the length rules to newPassword", () => {
    const short = "a".repeat(MIN_ARTIST_PASSWORD_LENGTH - 1);
    const result = artistPasswordResetFormSchema.safeParse({
      newPassword: short,
      confirmPassword: short,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["newPassword"]);
  });
});
