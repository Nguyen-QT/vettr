import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { loginAsClient } from "./authHelpers";
import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function openClientDashboard(page: Page, sessionId: string) {
  await loginAsClient(page, sessionId);
  await page.goto("/client");
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("client profile page", () => {
  test("shows existing details and reaches the page from the dashboard", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.onboardedClientSessionId);

    await page.getByRole("link", { name: "Your profile" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByLabel("Instagram handle")).toHaveValue(
      "e2e_client_onboarded"
    );
    await expect(page.getByLabel("First name")).toHaveValue("Jamie");
    await expect(page.getByLabel("Last name")).toHaveValue("Rivera");
    await expect(page.getByLabel("Date of birth")).toHaveValue("2000-01-01");
    await expect(page.getByLabel("Email")).toHaveValue(
      fixture.onboardedClientEmail
    );
  });

  test("saves an edited field", async ({ page }) => {
    const fixture = await readFixture();
    await openClientDashboard(page, fixture.onboardedClientSessionId);

    await page.goto("/client/profile");
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Phone (optional)").fill("555-0199");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Phone (optional)")).toHaveValue("555-0199");
  });
});
