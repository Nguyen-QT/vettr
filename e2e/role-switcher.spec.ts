import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsArtist, loginAsClient, loginWithSessionId } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("role switcher", () => {
  test("is not shown for a single-role artist session", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    // On the artist side the switch is a row in the avatar menu
    // (50.1.6.1); Settings being visible proves the menu is open.
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Switch to client view/ })
    ).toHaveCount(0);
  });

  test("is not shown for a single-role client session", async ({ page }) => {
    const fixture = await readFixture();

    await loginAsClient(page, fixture.clientLoginSessionId);
    await page.goto("/client");
    await expect(page).toHaveURL("http://localhost:3000/client");

    await expect(
      page.getByRole("button", { name: /Switch to artist view/ })
    ).toHaveCount(0);
  });

  test("switches a dual-role account from the artist dashboard to the client portal and back", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginWithSessionId(page, fixture.dualRoleSessionId);

    await page.goto(`/artist/${fixture.dualRoleArtistId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Account menu" }).click();
    const toClientItem = page.getByRole("menuitem", { name: "Switch to client view" });
    await expect(toClientItem).toBeVisible();
    await toClientItem.click();

    await page.waitForURL("**/client");
    await expect(page).toHaveURL(/\/client$/);

    const toArtistButton = page.getByRole("button", { name: "Switch to artist view" });
    await expect(toArtistButton).toBeVisible();
    await toArtistButton.click();

    await page.waitForURL(`**/artist/${fixture.dualRoleArtistId}`);
    await expect(page).toHaveURL(new RegExp(`/artist/${fixture.dualRoleArtistId}$`));
  });
});
