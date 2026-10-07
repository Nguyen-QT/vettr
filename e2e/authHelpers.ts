import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

// Must match src/domains/auth/constants.ts's SESSION_COOKIE_NAME --
// duplicated rather than imported, same reasoning as global-setup.ts's
// raw pg usage: e2e specs run outside Next's runtime/path aliases.
const SESSION_COOKIE_NAME = "vettr_session";

// Sets an already-valid session cookie directly, so a spec that isn't
// testing login itself can jump straight to a protected route instead of
// re-driving the login UI in every test.
export async function loginWithSessionId(page: Page, sessionId: string) {
  await page.context().addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

// Sets the pre-seeded, already-valid session cookie from global-setup.ts
// directly (CLAUDE.md 5.1.4/5.1.5) -- the single-role artist Account.
export async function loginAsArtist(page: Page, fixture: E2eFixture) {
  await loginWithSessionId(page, fixture.authenticatedSessionId);
}

// Sets one of the pre-seeded CLIENT session cookies from global-setup.ts
// (CLAUDE.md 54.2.6.1) -- takes the id rather than the fixture since
// there are several client Accounts (clientLoginSessionId,
// onboardedClientSessionId, imageClientSessionId).
export async function loginAsClient(page: Page, sessionId: string) {
  await loginWithSessionId(page, sessionId);
}

// Where the dev server's sendVerificationEmail writes instead of calling
// Resend (src/lib/emailCaptureSink.ts) -- wired into the webServer env in
// playwright.config.ts. Absolute so server and specs agree on cwd.
export const EMAIL_CAPTURE_SINK_PATH = path.join(__dirname, ".email-sink.jsonl");

interface CapturedEmailRecord {
  to: string;
  code: string;
}

// Reads every record in the capture sink once, without polling (empty if
// nothing has been sent yet) -- for asserting an address was never sent a
// code (54.3.6.1).
export async function readCapturedEmails(): Promise<CapturedEmailRecord[]> {
  const raw = await readFile(EMAIL_CAPTURE_SINK_PATH, "utf-8").catch(() => "");
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CapturedEmailRecord);
}

// Polls the capture sink for the newest verification code sent to `email`
// (JSONL, last matching line wins -- see captureEmail).
export async function readCapturedCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const records = await readCapturedEmails();
    const match = records.filter((record) => record.to === email).pop();
    if (match) return match.code;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No captured verification email for ${email}`);
}
