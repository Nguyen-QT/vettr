import { scrypt } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "./hashPassword";
import { verifyPassword } from "./verifyPassword";

// Spy on scrypt while still delegating to the real implementation, so
// the round-trip tests below exercise genuine crypto.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, scrypt: vi.fn(actual.scrypt) };
});

const mockedScrypt = vi.mocked(scrypt);

describe("verifyPassword", () => {
  beforeEach(() => {
    mockedScrypt.mockClear();
  });

  it("returns true for the correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    mockedScrypt.mockClear();

    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(
      true
    );
    // Positive control: proves the spy sees verifyPassword's scrypt, so
    // the null-hash "not called" assertion below can't pass vacuously.
    expect(mockedScrypt).toHaveBeenCalledOnce();
  });

  it("returns false for an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("returns false for a malformed stored hash instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });

  it("returns false for a null stored hash without running scrypt", async () => {
    await expect(verifyPassword("anything", null)).resolves.toBe(false);
    expect(mockedScrypt).not.toHaveBeenCalled();
  });
});
