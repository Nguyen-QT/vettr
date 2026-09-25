import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsArtist } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// Only asserts the page's UI-state rendering -- clicking "Connect with
// Stripe" redirects to Stripe's own hosted onboarding, which needs the
// user's own manual click-through in Stripe test mode (same limitation
// already flagged for Stripe flows in 7.1.9/14.1, CLAUDE.md 24.1.5).
test.describe("payouts (artist settings)", () => {
  test("shows a not-connected status and a Connect with Stripe control for a fresh artist", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/payouts`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Account: Not connected")).toBeVisible();
    await expect(page.getByText("Charges: Pending")).toBeVisible();
    await expect(page.getByText("Payouts: Pending")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect with Stripe" })
    ).toBeVisible();
  });

  test("is reachable from the settings nav", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/settings/deposits`);
    await page.getByRole("link", { name: "Payouts" }).click();

    await expect(page).toHaveURL(
      `http://localhost:3000/artist/${fixture.artistId}/settings/payouts`
    );
  });
});
