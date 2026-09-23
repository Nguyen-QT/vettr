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

test.describe("artist cancels an upcoming appointment", () => {
  test("removes the booking from the upcoming list", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.cancelUpcomingClientHandle,
    });
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Cancel booking" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel booking" })
      .click();

    await expect(
      page.getByText(fixture.cancelUpcomingClientHandle)
    ).not.toBeVisible();
  });
});
