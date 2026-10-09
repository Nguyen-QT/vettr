import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Full authenticated-flow coverage (sign-in/logout via the actual UI)
// lives in client-auth.spec.ts (54.3.6.1). This spec exercises the
// proxy itself (CLAUDE.md 5.2.3) via raw requests rather than page
// navigation, since it predates the /client pages existing.
test.describe("client route protection", () => {
  test("redirects an unauthenticated request to /client to the client login page", async ({
    request,
  }) => {
    const response = await request.get("/client", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    const location = response.headers()["location"];
    expect(location).toContain("/client/login");
    expect(location).toContain("redirectTo=%2Fclient");
  });

  test("leaves the public client login path unredirected", async ({ request }) => {
    const response = await request.get("/client/login", { maxRedirects: 0 });

    // A 200 (not a redirect) confirms the proxy let the request
    // through to the real login page (5.2.4).
    expect(response.status()).toBe(200);
  });

  // Clients are passwordless (54.8.6.1): the signup and verify-email pages
  // are deleted, so these are ordinary protected /client paths now.
  for (const retiredPath of ["/client/signup", "/client/verify-email"]) {
    test(`no longer treats ${retiredPath} as public`, async ({ request }) => {
      const response = await request.get(retiredPath, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      const location = response.headers()["location"];
      expect(location).toContain("/client/login");
      expect(location).toContain(`redirectTo=${encodeURIComponent(retiredPath)}`);
    });

    test(`returns the themed 404 for ${retiredPath} once signed in`, async ({ page }) => {
      const fixture = await readFixture();
      await loginAsClient(page, fixture.clientLoginSessionId);

      const response = await page.goto(retiredPath);

      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: "Page not found" })
      ).toBeVisible();
    });
  }

  // Proves the seeded CLIENT sessions + loginAsClient cookie injection
  // (54.2.6.1) reach the protected portal without the login UI.
  for (const key of [
    "clientLoginSessionId",
    "onboardedClientSessionId",
    "imageClientSessionId",
  ] as const) {
    test(`lets a seeded ${key} cookie reach /client`, async ({ page }) => {
      const fixture = await readFixture();
      await loginAsClient(page, fixture[key]);

      await page.goto("/client");

      await expect(page).toHaveURL(/\/client$/);
    });
  }
});
