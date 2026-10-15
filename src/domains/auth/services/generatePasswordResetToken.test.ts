import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PASSWORD_RESET_TOKEN_EXPIRY_MS } from "../constants";
import { generatePasswordResetToken } from "./generatePasswordResetToken";
import { hashPasswordResetToken } from "./hashPasswordResetToken";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});

const mockedRandomBytes = vi.mocked(randomBytes as (size: number) => Buffer);

describe("generatePasswordResetToken", () => {
  afterEach(() => {
    mockedRandomBytes.mockClear();
  });

  it("returns a 43-char base64url token", () => {
    expect(generatePasswordResetToken().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("draws 256 bits from the CSPRNG", () => {
    generatePasswordResetToken();
    expect(mockedRandomBytes).toHaveBeenCalledWith(32);
  });

  it("encodes the random bytes as unpadded base64url", () => {
    mockedRandomBytes.mockReturnValueOnce(Buffer.alloc(32));
    expect(generatePasswordResetToken().token).toBe("A".repeat(43));
  });

  it("returns the sha256 hash of the token, never the plaintext", () => {
    const { token, tokenHash } = generatePasswordResetToken();
    expect(tokenHash).toBe(hashPasswordResetToken(token));
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).not.toBe(token);
  });

  it("sets expiresAt to now plus the reset link expiry", () => {
    const now = new Date("2026-10-15T12:00:00.000Z");
    const { expiresAt } = generatePasswordResetToken(now);
    expect(expiresAt.getTime()).toBe(now.getTime() + PASSWORD_RESET_TOKEN_EXPIRY_MS);
  });
});
