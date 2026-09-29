import { randomInt } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMAIL_VERIFICATION_CODE_EXPIRY_MS } from "../constants";
import { generateEmailVerificationCode } from "./generateEmailVerificationCode";
import { hashEmailVerificationCode } from "./hashEmailVerificationCode";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

const mockedRandomInt = vi.mocked(randomInt as (min: number, max: number) => number);

describe("generateEmailVerificationCode", () => {
  afterEach(() => {
    mockedRandomInt.mockClear();
  });

  it("returns a 6-digit numeric code", () => {
    expect(generateEmailVerificationCode().code).toMatch(/^\d{6}$/);
  });

  it("returns the sha256 hash of the code, never the plaintext", () => {
    const { code, codeHash } = generateEmailVerificationCode();
    expect(codeHash).toBe(hashEmailVerificationCode(code));
    expect(codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sets expiresAt to now plus the verification code expiry", () => {
    const now = new Date("2026-09-29T12:00:00.000Z");
    const { expiresAt } = generateEmailVerificationCode(now);
    expect(expiresAt.getTime()).toBe(now.getTime() + EMAIL_VERIFICATION_CODE_EXPIRY_MS);
  });

  it("draws from the full 000000-999999 keyspace", () => {
    generateEmailVerificationCode();
    expect(mockedRandomInt).toHaveBeenCalledWith(0, 1_000_000);
  });

  it.each([
    [0, "000000"],
    [42, "000042"],
    [999_999, "999999"],
  ])("zero-pads a random value of %i to %s", (value, expected) => {
    mockedRandomInt.mockReturnValueOnce(value);
    expect(generateEmailVerificationCode().code).toBe(expected);
  });
});
