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
  test("shows a past-due APPROVED booking under the Needs Resolution tab", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("tab", { name: /Needs resolution/ })).toBeVisible();
    await page.getByRole("tab", { name: /Needs resolution/ }).click();

    await expect(page.getByText(fixture.pastDueNoShowClientHandle)).toBeVisible();
  });

  test("switching to the Needs Resolution tab updates the URL, and reloading it keeps the tab selected", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("tab", { name: /Needs resolution/ }).click();
    await expect(page).toHaveURL(/[?&]tab=needs-resolution/);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(fixture.pastDueNoShowClientHandle)).toBeVisible();

    await page.goBack();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(fixture.bookedSlotClientHandle)).toBeVisible();
  });

  test("offers a Checkout link instead of a direct Mark completed control", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueCompleteClientHandle,
    });
    await expect(card.getByRole("button", { name: "Mark completed" })).toHaveCount(0);
    await expect(card.getByRole("link", { name: "Checkout" })).toBeVisible();
  });

  test("marks a past-due appointment as a no-show", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueNoShowClientHandle,
    });
    await card.getByRole("button", { name: "Mark no-show" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Mark no-show" })
      .click();

    await expect(
      page.getByText(fixture.pastDueNoShowClientHandle)
    ).not.toBeVisible();
  });

  test("does not offer a Cancel control for a past-due appointment", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments?tab=needs-resolution`);
    await page.waitForLoadState("networkidle");

    const card = page.locator("article", {
      hasText: fixture.pastDueUntouchedClientHandle,
    });
    await expect(card.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  });

  test("shows count badges on the nav's Requests and Upcoming links", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}/appointments`);
    await page.waitForLoadState("networkidle");

    // Several PENDING/past-due fixtures are seeded and never fully
    // resolved by any single spec, so a non-zero count is a safe
    // assertion regardless of e2e run order/parallelism.
    const requestsLink = page.getByRole("link", { name: /Requests/ });
    await expect(requestsLink.getByText(/^\d+$/)).toBeVisible();

    const upcomingLink = page.getByRole("link", { name: /Upcoming/ });
    await expect(upcomingLink.getByText(/^\d+$/)).toBeVisible();
  });
});
