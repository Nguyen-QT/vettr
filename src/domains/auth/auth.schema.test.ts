import { describe, expect, it } from "vitest";

import {
  resendVerificationCodeInputSchema,
  verifyEmailCodeInputSchema,
} from "./auth.schema";

const validVerifyInput = {
  email: "client@example.com",
  code: "123456",
  password: "hunter2hunter2",
};

describe("verifyEmailCodeInputSchema", () => {
  it("accepts a valid payload", () => {
    expect(verifyEmailCodeInputSchema.safeParse(validVerifyInput).success).toBe(true);
  });

  it("keeps a leading-zero code as a string", () => {
    const result = verifyEmailCodeInputSchema.safeParse({ ...validVerifyInput, code: "001234" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.code).toBe("001234");
  });

  it.each(["12345", "1234567", "12a456", "", "123 56"])("rejects code %j", (code) => {
    expect(verifyEmailCodeInputSchema.safeParse({ ...validVerifyInput, code }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      verifyEmailCodeInputSchema.safeParse({ ...validVerifyInput, email: "not-an-email" }).success
    ).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      verifyEmailCodeInputSchema.safeParse({ ...validVerifyInput, password: "" }).success
    ).toBe(false);
  });
});

describe("resendVerificationCodeInputSchema", () => {
  it("accepts a valid email", () => {
    expect(
      resendVerificationCodeInputSchema.safeParse({ email: "client@example.com" }).success
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(resendVerificationCodeInputSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});
