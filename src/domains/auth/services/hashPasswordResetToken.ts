import { createHash } from "node:crypto";

// sha256, not scrypt -- the token is 256 random bits, so it can't be
// guessed and a slow hash buys nothing; storing only the hash means a DB
// read never yields a working link. Shared by generatePasswordResetToken
// (storing) and the reset lookup (comparing) so both sides always hash
// the exact same way.
export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
