import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { E2eFixture } from "./global-setup";

const FIXTURE_PATH = path.join(__dirname, ".fixture.json");

async function readFixture(): Promise<E2eFixture> {
  const raw = await readFile(FIXTURE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loginAsClient(
  page: import("@playwright/test").Page,
  fixture: E2eFixture
) {
  await page.goto("/client/login");
  await page.getByLabel("Email").fill(fixture.clientLoginEmail);
  await page.getByLabel("Password").fill(fixture.clientLoginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/client");
}

test.describe("logged-in client booking & search access", () => {
  test("finds an artist from the client dashboard", async ({ page }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture);

    await page.getByRole("link", { name: "Find an artist" }).click();

    await expect(page).toHaveURL(/\/artists$/);
    await expect(page.getByRole("link", { name: /E2E Fixture Artist/ })).toBeVisible();
  });

  test("prefills and locks the intake form's contact fields for a signed-in client", async ({
    page,
  }) => {
    const fixture = await readFixture();
    await loginAsClient(page, fixture);

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    const email = page.getByLabel("Email");
    const phone = page.getByLabel("Phone (optional)");

    await expect(instagramHandle).toHaveValue("e2e_client_login");
    await expect(email).toHaveValue(fixture.clientLoginEmail);
    await expect(instagramHandle).toBeDisabled();
    await expect(email).toBeDisabled();
    await expect(phone).toBeDisabled();
  });

  test("leaves the intake form blank and editable for a signed-out visitor", async ({
    page,
  }) => {
    const fixture = await readFixture();

    await page.goto(`/book/${fixture.artistId}`);
    await page.waitForLoadState("networkidle");

    const instagramHandle = page.getByLabel("Instagram handle");
    const email = page.getByLabel("Email");

    await expect(instagramHandle).toHaveValue("");
    await expect(email).toHaveValue("");
    await expect(instagramHandle).toBeEnabled();
    await expect(email).toBeEnabled();
  });
});
