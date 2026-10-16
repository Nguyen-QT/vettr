import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsArtist, loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";
import { completeIntakeStep, completeServiceStep } from "./wizardHelpers";

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

// Playwright lowercases response header names. Enforcing since 53.4.2.2; the
// Report-Only name must not linger next to it.
const CSP_HEADER = "content-security-policy";
const CSP_REPORT_ONLY_HEADER = "content-security-policy-report-only";

function nonceFrom(csp: string | undefined): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

test.describe("nonce CSP (53.4.3.2)", () => {
  for (const pathname of ["/", "/artist/login"]) {
    test(`${pathname} carries the enforcing CSP with a nonce`, async ({ request }) => {
      const response = await request.get(pathname, { maxRedirects: 0 });

      expect(response.status()).toBe(200);
      const headers = response.headers();
      const csp = headers[CSP_HEADER];
      expect(csp).toContain("'strict-dynamic'");
      expect(nonceFrom(csp)).toBeDefined();
      expect(headers[CSP_REPORT_ONLY_HEADER]).toBeUndefined();
    });
  }

  test("two loads of / carry different nonces", async ({ request }) => {
    const first = await request.get("/", { maxRedirects: 0 });
    const second = await request.get("/", { maxRedirects: 0 });

    const firstNonce = nonceFrom(first.headers()[CSP_HEADER]);
    expect(firstNonce).toBeDefined();
    expect(nonceFrom(second.headers()[CSP_HEADER])).not.toBe(firstNonce);
  });

  test("the UploadThing API route carries no CSP", async ({ request }) => {
    const response = await request.get("/api/uploadthing", { maxRedirects: 0 });

    expect(response.status()).not.toBe(404);
    const headers = response.headers();
    expect(headers[CSP_HEADER]).toBeUndefined();
    expect(headers[CSP_REPORT_ONLY_HEADER]).toBeUndefined();
  });
});

// What the guard keeps from each `securitypolicyviolation` event. Never the
// policy text, so the nonce isn't logged.
interface CspViolation {
  directive: string;
  blockedUri: string;
  sourceFile: string;
}

declare global {
  interface Window {
    __cspViolations?: CspViolation[];
  }
}

// Every blocked load fires `securitypolicyviolation`, so this catches what the
// policy blocks even when the page still renders. It runs before any page
// script in every document, so the head's theme script is covered.
async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations?.push({
        directive: event.effectiveDirective,
        blockedUri: event.blockedURI,
        sourceFile: event.sourceFile,
      });
    });
  });
}

// Reads the current document's violations, so call it before navigating
// away: a full navigation starts a fresh window. It doesn't wait for
// networkidle itself, since a mounted Stripe.js never lets the network idle;
// callers wait for their own content first.
async function expectNoCspViolations(page: Page, step: string): Promise<void> {
  const violations = await page.evaluate(() => window.__cspViolations ?? []);
  expect(violations, step).toEqual([]);
}

// A violation from a host the policy doesn't list is a builder defect
// (53.4.2.1): fix it there, never by loosening this guard. E2E runs `next dev`,
// so this proves the development policy only; the production differences are
// unit-tested and were walked on staging before enforcing (53.4.2.2).
test.describe("CSP violation guard (53.4.6.1)", () => {
  test("the theme init script carries the response's nonce", async ({ request }) => {
    const response = await request.get("/", { maxRedirects: 0 });

    const headerNonce = nonceFrom(response.headers()[CSP_HEADER]);
    expect(headerNonce).toBeDefined();
    const themeScriptAttributes = (await response.text()).match(
      /<script\b([^>]*)>\(function\(\)\{try\{if\(localStorage/
    )?.[1];
    expect(themeScriptAttributes).toBeDefined();
    expect(themeScriptAttributes?.match(/\bnonce="([^"]+)"/)?.[1]).toBe(headerNonce);
  });

  test("public pages load without a violation", async ({ page }) => {
    const { artistHandle } = await readFixture();
    await recordCspViolations(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: "Vettr" })).toBeVisible();
    await expectNoCspViolations(page, "/");

    await page.goto(`/@${artistHandle}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { level: 1, name: "E2E Fixture Artist" })
    ).toBeVisible();
    await expectNoCspViolations(page, `/@${artistHandle}`);

    // Both were prerendered before the layout read headers().
    for (const pathname of ["/artist/login", "/client/login"]) {
      await page.goto(pathname);
      await page.waitForLoadState("networkidle");
      await expect(page.getByLabel("Email")).toBeVisible();
      await expectNoCspViolations(page, pathname);
    }
  });

  test("the booking wizard gets through intake with an upload without a violation", async ({
    page,
  }) => {
    const { artistHandle } = await readFixture();
    await recordCspViolations(page);

    await page.goto(`/@${artistHandle}/book`);
    await page.waitForLoadState("networkidle");
    await completeServiceStep(page);
    await completeIntakeStep(page);
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Preferred date")).toBeVisible();
    await expectNoCspViolations(page, "booking wizard through intake");
  });

  test("the client dashboard shows the deposit PaymentElement without a violation", async ({
    page,
  }) => {
    const { cspGuardClientSessionId } = await readFixture();
    await recordCspViolations(page);
    await loginAsClient(page, cspGuardClientSessionId);

    await page.goto("/client");
    await page.waitForLoadState("networkidle");
    const card = page.locator("article", { hasText: "TIER_4" });
    await card.getByRole("button", { name: "Pay deposit" }).click();

    // The form only renders once Stripe.js and its Elements frame have loaded,
    // which is as settled as this page gets (Stripe.js keeps requests open).
    await expect(card.getByRole("button", { name: "Confirm payment" })).toBeVisible({
      timeout: 15_000,
    });
    await expectNoCspViolations(page, "/client deposit PaymentElement");
  });

  test("the artist dashboard and calendar load without a violation", async ({ page }) => {
    const fixture = await readFixture();
    await recordCspViolations(page);
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator('[data-slot="stat-tile"]', { hasText: "Pending requests" })
    ).toBeVisible();
    await expectNoCspViolations(page, "artist dashboard");

    await page.goto(`/artist/${fixture.artistId}/calendar`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByLabel("Jump to date")).toBeVisible();
    await expectNoCspViolations(page, "artist calendar");
  });
});