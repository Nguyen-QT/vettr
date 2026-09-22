import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsArtist } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loginAsClient(page: Page, fixture: E2eFixture) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(fixture.clientLoginEmail);
  await page.getByLabel("Password").fill(fixture.clientLoginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("deposit amounts (artist settings)", () => {
  test("shows the seeded TIER_4 amount and persists an edit across reload", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/hours`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("TIER_4")).toHaveValue("40");

    await page.getByLabel("TIER_3").fill("55");
    const tier3Row = page
      .getByLabel("TIER_3")
      .locator("xpath=ancestor::div[@data-slot='field']");
    await tier3Row.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("TIER_3")).toHaveValue("55");
  });
});

test.describe("deposit payment (client dashboard)", () => {
  // Only asserts the payment form loads (clientSecret fetched, Stripe
  // Elements mounted) -- actual card entry/submission happens inside a
  // Stripe-hosted iframe and needs the user's own manual click-through
  // in Stripe test mode (CLAUDE.md's Manual E2E Verification Gate).
  test("shows a Pay Deposit card for the eligible booking and loads the payment form", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture);

    const card = page.locator("article", { hasText: "TIER_4" });
    await expect(card.getByText("Deposit required: £40")).toBeVisible();

    await card.getByRole("button", { name: "Pay deposit" }).click();

    await expect(
      card.getByRole("button", { name: "Confirm payment" })
    ).toBeVisible({ timeout: 15_000 });
  });
});
