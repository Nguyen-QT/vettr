import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

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

test.describe("client self-service booking modification and cancellation", () => {
  test("cancels a pending booking", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture);

    const card = page.locator("article", { hasText: "TIER_2" });
    await expect(card.getByText("Pending review")).toBeVisible();

    await card.getByRole("button", { name: "Cancel booking" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel booking" })
      .click();

    await expect(card.getByText("Cancelled")).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Cancel booking" })
    ).not.toBeVisible();
  });

  test("edits a pending booking's budget range", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture);

    const card = page.locator("article", { hasText: "TIER_3" });
    await expect(card.getByText("£150 – £300")).toBeVisible();

    await card.getByRole("button", { name: "Edit" }).click();
    const minPriceInput = card.getByLabel("Budget range (£)");
    await minPriceInput.fill("175");
    await card.getByRole("button", { name: "Save" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(card.getByText("£175 – £300")).toBeVisible();
  });
});
