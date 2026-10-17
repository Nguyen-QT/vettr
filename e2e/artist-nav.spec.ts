import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { loginAsArtist, loginWithSessionId } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

// The structure snapshots use the dual-role artist (in its never-switched
// artist-view session): it has no bookings, so no count badges render
// and the link names are the same whatever order the specs run in.
async function openDualRoleArtistDashboard(
  page: Page,
  fixture: E2eFixture
): Promise<void> {
  await loginWithSessionId(page, fixture.dualRoleArtistViewSessionId);
  await page.goto(`/artist/${fixture.dualRoleArtistId}`);
  // Wait for hydration so the snapshot can't race it.
  await page.waitForLoadState("networkidle");
}

// 50.1.6.1: PrimaryNav (desktop bar), MobileNavDrawer (below `lg`) and
// UserMenu (every width) wired into the artist layout's header.
test.describe("artist header nav (desktop)", () => {
  test("shows the primary links in the bar and Settings behind the account menu", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const nav = page.getByRole("navigation", { name: "Primary" });
    const base = `/artist/${fixture.artistId}`;
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", base);
    await expect(nav.getByRole("link", { name: /^Requests/ })).toHaveAttribute(
      "href",
      `${base}/requests`
    );
    await expect(nav.getByRole("link", { name: /^Appointments/ })).toHaveAttribute(
      "href",
      `${base}/appointments`
    );
    await expect(nav.getByRole("link", { name: "Calendar" })).toHaveAttribute(
      "href",
      `${base}/calendar`
    );

    // The ☰ trigger is rendered but hidden at desktop widths.
    const drawerTrigger = page.getByRole("button", { name: "Open menu", includeHidden: true });
    await expect(drawerTrigger).toHaveCount(1);
    await expect(drawerTrigger).toBeHidden();

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(`http://localhost:3000${base}/settings/hours`);
  });

  test("header structure matches the aria snapshot", async ({ page }) => {
    const fixture = await readFixture();
    await openDualRoleArtistDashboard(page, fixture);

    await expect(page.locator("header")).toMatchAriaSnapshot(`
      - link "Vettr"
      - navigation "Primary":
        - link "Dashboard"
        - link "Requests"
        - link "Appointments"
        - link "Calendar"
      - button "Account menu"
    `);
  });
});

test.describe("artist header nav (mobile)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the ☰ drawer holds the primary links and closes after navigating", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsArtist(page, fixture);

    await page.goto(`/artist/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    // The bar is rendered but hidden; the avatar menu stays visible.
    const bar = page.getByRole("navigation", { name: "Primary", includeHidden: true });
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeHidden();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(drawer.getByRole("link", { name: /^Requests/ })).toBeVisible();
    await expect(drawer.getByRole("link", { name: /^Appointments/ })).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Calendar" })).toBeVisible();

    await drawer.getByRole("link", { name: /^Requests/ }).click();
    await expect(page).toHaveURL(
      `http://localhost:3000/artist/${fixture.artistId}/requests`
    );
    await expect(drawer).toBeHidden();
  });

  test("header structure matches the aria snapshot", async ({ page }) => {
    const fixture = await readFixture();
    await openDualRoleArtistDashboard(page, fixture);

    await expect(page.locator("header")).toMatchAriaSnapshot(`
      - button "Open menu"
      - link "Vettr"
      - button "Account menu"
    `);
  });
});
