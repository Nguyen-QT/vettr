import { appendFile } from "node:fs/promises";

// Test-only capture sink for outbound auth emails (CLAUDE.md 27.3.2.3,
// 71.1.2.2): Playwright can't receive real email, so when this sink is
// enabled, sendVerificationEmail and sendPasswordResetEmail write here
// instead of calling Resend, and e2e reads the code or reset link back
// through it. Hard-gated on NODE_ENV so a stray env var can never divert
// a real, production email.
export function getEmailCaptureSinkPath(): string | null {
  const path = process.env.EMAIL_CAPTURE_SINK_PATH;
  if (!path || process.env.NODE_ENV === "production") {
    return null;
  }
  return path;
}

export interface CapturedVerificationCodeEmail {
  to: string;
  code: string;
  sentAt: string;
}

export interface CapturedPasswordResetEmail {
  to: string;
  resetLink: string;
  sentAt: string;
}

// Told apart by which field is present (`code` or `resetLink`), so
// verification-code records keep the shape existing readers expect.
export type CapturedEmail = CapturedVerificationCodeEmail | CapturedPasswordResetEmail;

// One JSON object per line (JSONL), appended -- each write is a single
// small, atomic-enough append so Playwright's parallel workers can write
// concurrently without interleaving or truncating each other's records.
// JSON.stringify escapes newlines/control characters in every field, so
// a malicious value can never inject an extra line or corrupt the file
// structure; a reader takes the last line matching a given `to`.
export async function captureEmail(record: CapturedEmail): Promise<void> {
  const path = getEmailCaptureSinkPath();
  if (!path) {
    return;
  }
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}
