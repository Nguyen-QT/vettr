import { randomBytes } from "node:crypto";

import { PASSWORD_RESET_TOKEN_EXPIRY_MS } from "../constants";
import { hashPasswordResetToken } from "./hashPasswordResetToken";

// 256 bits, which base64url-encodes to 43 chars with no padding.
const TOKEN_BYTES = 32;

export type GeneratedPasswordResetToken = {
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

// Pure helper -- no DB, no logging. The plaintext token is returned only
// so the caller can email it; only tokenHash is ever meant to be stored.
// base64url keeps the token URL-safe in the emailed link's query string.
export function generatePasswordResetToken(now: Date = new Date()): GeneratedPasswordResetToken {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    token,
    tokenHash: hashPasswordResetToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_EXPIRY_MS),
  };
}
