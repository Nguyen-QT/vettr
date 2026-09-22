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

test.describe("artist resolves a past-due appointment", () => {
  test("shows a past-due APPROVED booking under Needs Resolution", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Needs resolution")).toBeVisible();
    await expect(page.getByText(fixture.pastDueNoShowClientHandle)).toBeVisible();
  });

  test("marks a past-due appointment as completed", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueCompleteClientHandle,
    });
    await card.getByRole("button", { name: "Mark completed" }).click();

    await expect(
      page.getByText(fixture.pastDueCompleteClientHandle)
    ).not.toBeVisible();
  });

  test("marks a past-due appointment as a no-show", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueNoShowClientHandle,
    });
    await card.getByRole("button", { name: "Mark no-show" }).click();

    await expect(
      page.getByText(fixture.pastDueNoShowClientHandle)
    ).not.toBeVisible();
  });

  test("does not offer a Cancel control for a past-due appointment", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueUntouchedClientHandle,
    });
    await expect(card.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  });
});
