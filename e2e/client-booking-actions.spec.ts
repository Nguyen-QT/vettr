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

// Dedicated login for the image add/remove/preview specs below (CLAUDE.md
// 13.2.5) -- see the fixture-setup comment in global-setup.ts near
// imageClientId for why these live on their own client/login rather than
// clientLoginProfileId.
async function loginAsImageClient(page: Page, fixture: E2eFixture) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(fixture.imageClientEmail);
  await page.getByLabel("Password").fill(fixture.imageClientPassword);
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

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    const minPriceInput = card.getByLabel("Budget range (£)");
    await minPriceInput.fill("175");
    await card.getByRole("button", { name: "Save" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(card.getByText("£175 – £300")).toBeVisible();
  });

  // Covers the full add/remove/preview interaction against real
  // seeded DesignReference rows (CLAUDE.md 13.2.5) -- 13.1.3's own spec
  // deferred this exact coverage since it needs existing images to
  // interact with, not just an empty dropzone. Fixture seeds two
  // images specifically so a removal leaves one behind to verify --
  // removing the request's only image is a separate rejection case,
  // covered below. Runs on its own dedicated client login, not
  // clientLoginProfileId -- see loginAsImageClient. "Edit" is matched
  // with exact: true throughout this file's edit-mode tests:
  // Playwright's default name matching is a case-insensitive
  // substring, and "Cancel editing" (only rendered once editing has
  // started) otherwise silently matches "Edit" too.
  test("previews and removes an existing design reference image on a pending booking", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsImageClient(page, fixture);

    const card = page.locator("article", { hasText: "TIER_2" });
    await card.getByRole("button", { name: "Edit", exact: true }).click();

    await expect(card.getByRole("button", { name: "Remove image" })).toHaveCount(2);

    await card.getByRole("button", { name: "Design reference" }).first().click();
    await expect(
      page.getByRole("dialog").getByText("Design reference preview")
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await card.getByRole("button", { name: "Remove image" }).first().click();
    await expect(card.getByRole("button", { name: "Remove image" })).toHaveCount(1);

    await card.getByRole("button", { name: "Save" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(
      card.getByRole("button", { name: "Edit", exact: true })
    ).toBeVisible();
    // Confirm the removal actually persisted server-side, rather than
    // racing saveEdit's router.refresh() -- it flips isEditing to false
    // immediately, but the refetch of the booking's updated image list
    // resolves slightly after, and a networkidle wait doesn't reliably
    // guarantee that refetch has been applied to the React tree by the
    // time the next click fires. A hard reload forces a fresh
    // server-rendered fetch, sidestepping that timing window entirely.
    await page.reload();
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(card.getByRole("button", { name: "Remove image" })).toHaveCount(1);
  });

  test("rejects saving a pending booking with its last image removed", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsImageClient(page, fixture);

    // Same dedicated client as the test above, second booking (TIER_3,
    // one seeded image) -- both live on this client rather than
    // clientLoginProfileId, see loginAsImageClient.
    const card = page.locator("article", { hasText: "TIER_3" });
    await card.getByRole("button", { name: "Edit", exact: true }).click();

    await card.getByRole("button", { name: "Remove image" }).click();
    await expect(card.getByRole("button", { name: "Remove image" })).toHaveCount(0);

    await card.getByRole("button", { name: "Save" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Save changes" })
      .click();

    await expect(
      card.getByText("At least one design reference image is required.")
    ).toBeVisible();
    // Still in the (unsaved) edit form -- confirms the rejection
    // didn't silently fall through to view mode.
    await expect(card.getByRole("button", { name: "Cancel editing" })).toBeVisible();
  });
});
