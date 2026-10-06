import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { loginAsClient, loginWithSessionId } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

test.describe("logged-in client booking & search access", () => {
  test("finds an artist from the client dashboard", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.clientLoginSessionId);
    await page.goto("/client");
    await expect(page).toHaveURL("http://localhost:3000/client");

    await page.getByRole("link", { name: "Find an artist" }).click();

    await expect(page).toHaveURL(/\/artists$/);
    await expect(page.getByRole("link", { name: /E2E Fixture Artist/ })).toBeVisible();
  });

  test("prefills and locks the booking form's known contact fields for a signed-in client", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture.clientLoginSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    const email = page.getByLabel("Email");
    const phone = page.getByLabel("Phone (optional)");

    await expect(instagramHandle).toHaveValue("e2e_client_login");
    await expect(email).toHaveValue(fixture.clientLoginEmail);
    await expect(instagramHandle).toBeDisabled();
    await expect(email).toBeDisabled();
    // Per-field locking (CLAUDE.md 6.2): this fixture's phone was never
    // set, so unlike instagramHandle/email it stays editable rather
    // than being locked empty.
    await expect(phone).toBeEnabled();
  });

  test("leaves the booking form blank and editable for a signed-out visitor", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    const email = page.getByLabel("Email");

    await expect(instagramHandle).toHaveValue("");
    await expect(email).toHaveValue("");
    await expect(instagramHandle).toBeEnabled();
    await expect(email).toBeEnabled();
  });

  // Same dual-role Account (home role ARTIST) in both views (54.1.6.2):
  // prefill follows the session's activeRole, not the account's role.
  test("prefills for a dual-role account in client view", async ({ page }) => {
    const fixture = await readFixture();
    await loginWithSessionId(page, fixture.dualRoleClientViewSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    await expect(instagramHandle).toHaveValue("e2e_client_dual_role");
    await expect(instagramHandle).toBeDisabled();
  });

  test("treats a dual-role account in artist view as a guest", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginWithSessionId(page, fixture.dualRoleArtistViewSessionId);

    await page.goto(`/@${fixture.artistHandle}/book`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    await expect(instagramHandle).toHaveValue("");
    await expect(instagramHandle).toBeEnabled();
  });
});
