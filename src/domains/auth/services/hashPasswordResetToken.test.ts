import { describe, expect, it } from "vitest";

import { hashPasswordResetToken } from "./hashPasswordResetToken";

describe("hashPasswordResetToken", () => {
  it("returns the sha256 hex digest of the token", () => {
    expect(hashPasswordResetToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic for the same token", () => {
    const token = "A".repeat(43);
    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
  });

  it("produces different hashes for different tokens", () => {
    expect(hashPasswordResetToken("A".repeat(43))).not.toBe(
      hashPasswordResetToken(`${"A".repeat(42)}B`),
    );
  });

  it("never returns the plaintext token", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    expect(hashPasswordResetToken(token)).not.toContain(token);
  });
});
