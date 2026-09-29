import { createHash } from "node:crypto";

// sha256, not scrypt (CLAUDE.md 27.3) -- the code is short-lived and
// attempt-capped, so scrypt's deliberate slowness buys nothing here.
// Shared by generateEmailVerificationCode (storing) and verifyEmailCode
// (comparing) so both sides always hash the exact same way.
export function hashEmailVerificationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
