import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Mirrors next.config.ts's SECURITY_HEADERS (53.4.3.1). Keyed by lowercase
// name, since Playwright lowercases response header names.
const STATIC_SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
};

function expectStaticSecurityHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    expect(headers[name], name).toBe(value);
  }
  // Naming either would switch off PaymentElement wallets or Phase 59's
  // passkeys, with no visible error.
  expect(headers["permissions-policy"]).not.toMatch(/payment|publickey-credentials/);
}

test.describe("static security headers (53.4.3.1)", () => {
  test("the portal gate at / carries them", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expectStaticSecurityHeaders(response.headers());
  });

  test("a public profile served by the /@handle rewrite carries them", async ({
    request,
  }) => {
    const { artistHandle } = await readFixture();

    const response = await request.get(`/@${artistHandle}`, { maxRedirects: 0 });

    expect(response.status()).toBe(200);
    expectStaticSecurityHeaders(response.headers());
  });

  test("the UploadThing API route carries them", async ({ request }) => {
    const response = await request.get("/api/uploadthing", { maxRedirects: 0 });

    // Not a 404, so the route handler answered. The status isn't pinned: CI's
    // dummy UPLOADTHING_TOKEN may fail the handler, and the headers must
    // arrive on whatever it returns.
    expect(response.status()).not.toBe(404);
    expectStaticSecurityHeaders(response.headers());
  });
});
