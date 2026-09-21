import { describe, expect, it } from "vitest";

import { hashPassword } from "./hashPassword";

describe("hashPassword", () => {
  it("returns a salt:hash pair distinct from the plaintext password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(hash).not.toContain("correct horse battery staple");
  });

  it("produces a different hash for the same password on each call", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toEqual(second);
  });
});
