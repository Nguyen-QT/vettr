import { describe, expect, it } from "vitest";

import { hashEmailVerificationCode } from "./hashEmailVerificationCode";

describe("hashEmailVerificationCode", () => {
  it("returns the sha256 hex digest of the code", () => {
    expect(hashEmailVerificationCode("123456")).toBe(
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92",
    );
  });

  it("is deterministic for the same code", () => {
    expect(hashEmailVerificationCode("000042")).toBe(hashEmailVerificationCode("000042"));
  });

  it("produces different hashes for different codes", () => {
    expect(hashEmailVerificationCode("000042")).not.toBe(hashEmailVerificationCode("000043"));
  });

  it("never returns the plaintext code", () => {
    expect(hashEmailVerificationCode("123456")).not.toContain("123456");
  });
});
