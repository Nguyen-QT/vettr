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

test.describe("artist runs the day-of checkout flow", () => {
  test("adds an add-on, sees it reflected in the total, then finalizes", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueFinalizeClientHandle,
    });
    await card.getByRole("link", { name: "Checkout" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("No add-ons yet.")).toBeVisible();

    await page.getByLabel("Label").fill("Extra shading");
    await page.getByLabel("Price (£)").fill("15");
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Extra shading")).toBeVisible();
    const totalRow = page.getByText("Total", { exact: true }).locator("xpath=..");
    // Base estimatedPrice (150, CLAUDE.md 18.2's fixture fix) + the £15 add-on.
    await expect(totalRow).toContainText("£165");

    await page.getByRole("button", { name: "Finalize & complete" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Finalize & complete" })
      .click();
    await page.waitForURL(`**/artist/${fixture.artistId}/appointments`);

    await expect(
      page.getByText(fixture.pastDueFinalizeClientHandle)
    ).not.toBeVisible();
  });

  test("removes an add-on before finalizing", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueCheckoutClientHandle,
    });
    await card.getByRole("link", { name: "Checkout" }).click();
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Label").fill("Touch-up");
    await page.getByLabel("Price (£)").fill("10");
    await page.getByRole("button", { name: "Add" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Touch-up")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Touch-up")).not.toBeVisible();
    await expect(page.getByText("No add-ons yet.")).toBeVisible();
  });

  test("overrides the payment method, gated behind a confirmation", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueUntouchedClientHandle,
    });
    await card.getByRole("link", { name: "Checkout" }).click();
    await page.waitForLoadState("networkidle");

    // click, not check() -- the radio is controlled by the server-read
    // payment method and only actually flips once the override is
    // confirmed below, so a check()-style postcondition wait would time
    // out on the click itself.
    await page.getByRole("radio", { name: "Cash" }).click();

    await expect(page.getByText("Change the payment method?")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Confirm" })
      .click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("radio", { name: "Cash" })).toBeChecked();
  });
});
